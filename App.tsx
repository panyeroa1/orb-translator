import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OrbStatus, HistoryEntry } from './types';
import {
  POLLING_INTERVAL_MIN,
  POLLING_INTERVAL_MAX,
  LANGUAGES,
  GREEK_VOICES
} from './constants';
import { useDraggable } from './hooks/useDraggable';
import Orb from './components/Orb';
import { GeminiLiveService } from './services/geminiService';
import { fetchLatestTranscription, registerUser } from './services/supabaseService';

// Detect current origin dynamically
const GET_APP_DOMAIN = () => typeof window !== 'undefined' ? window.location.origin : "https://translate.eburon.ai";

const App: React.FC = () => {
  const [status, setStatus] = useState<OrbStatus>(OrbStatus.IDLE);
  const [isPressed, setIsPressed] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [regFeedback, setRegFeedback] = useState(false);
  
  // Settings State
  const [selectedLanguage, setSelectedLanguage] = useState(() => localStorage.getItem('orb_lang') || 'en');
  const [selectedVoice, setSelectedVoice] = useState(() => localStorage.getItem('orb_voice') || 'Kore');
  const [meetingId, setMeetingId] = useState(() => localStorage.getItem('orb_meeting_id') || '');
  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem('orb_prompt') || 'Professional high-fidelity translator.');
  const [userId, setUserId] = useState(() => localStorage.getItem('orb_user_id') || '');
  const [testText, setTestText] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    const saved = localStorage.getItem('orb_history');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Refs
  const lastTextRef = useRef<string>('');
  const seenHashesRef = useRef<Set<string>>(new Set());
  const pollingIntervalRef = useRef<number>(POLLING_INTERVAL_MIN);
  const textQueueRef = useRef<string[]>([]);
  const isBusyRef = useRef<boolean>(false);
  const currentTurnActiveRef = useRef<boolean>(false);
  const liveServiceRef = useRef<GeminiLiveService | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pressStartPosRef = useRef<{x: number, y: number, time: number} | null>(null);

  const { position, isDragging, handleMouseDown: dragMouseDown } = useDraggable(100, 200);

  const currentTranslationRef = useRef<string>('');
  const currentOriginalRef = useRef<string>('');

  const ensureUserAccount = useCallback(async (force: boolean = false) => {
    let currentId = localStorage.getItem('orb_user_id') || userId;
    if (!currentId || force) {
      if (!currentId) {
        currentId = crypto.randomUUID();
        localStorage.setItem('orb_user_id', currentId);
      }
      setUserId(currentId);
      const success = await registerUser(currentId);
      if (success && force) {
        setRegFeedback(true);
        setTimeout(() => setRegFeedback(false), 2000);
      }
    } else if (!userId) {
      setUserId(currentId);
    }
    return currentId;
  }, [userId]);

  // Initialize User on Mount
  useEffect(() => {
    ensureUserAccount();
  }, []);

  const processNextInQueue = useCallback(async () => {
    if (isBusyRef.current || textQueueRef.current.length === 0 || !liveServiceRef.current) return;
    
    isBusyRef.current = true;
    currentTurnActiveRef.current = true;
    const text = textQueueRef.current.shift()!;
    currentOriginalRef.current = text;
    currentTranslationRef.current = '';

    setStatus(OrbStatus.TRANSLATING);
    const langName = LANGUAGES.find(l => l.code === selectedLanguage)?.name || 'English';
    liveServiceRef.current.sendText(text, langName);
  }, [selectedLanguage]);

  useEffect(() => {
    const apiKey = (window as any).process?.env?.API_KEY || (import.meta as any).env?.VITE_API_KEY || '';
    const service = new GeminiLiveService(apiKey);
    liveServiceRef.current = service;
    analyserRef.current = service.getAnalyser();
    return () => service.disconnect();
  }, []);

  useEffect(() => {
    if (isMonitoring && liveServiceRef.current) {
      const langName = LANGUAGES.find(l => l.code === selectedLanguage)?.name || 'English';
      liveServiceRef.current.connect(langName, selectedVoice, systemPrompt, {
        onTranscription: (text) => {
          currentTranslationRef.current += text;
        },
        onAudioStarted: () => {
          setStatus(OrbStatus.SPEAKING);
        },
        onAudioEnded: () => {
          if (!currentTurnActiveRef.current) {
            setStatus(OrbStatus.IDLE);
          }
        },
        onTurnComplete: () => {
          if (currentTranslationRef.current) {
            const newEntry: HistoryEntry = {
              id: Math.random().toString(36).substring(7),
              originalText: currentOriginalRef.current,
              translatedText: currentTranslationRef.current,
              timestamp: Date.now()
            };
            setHistory(prev => {
              const updated = [newEntry, ...prev].slice(0, 50);
              localStorage.setItem('orb_history', JSON.stringify(updated));
              return updated;
            });
          }
          
          currentTurnActiveRef.current = false;
          isBusyRef.current = false;
          setStatus(OrbStatus.IDLE);
          processNextInQueue();
        },
        onError: (err) => {
          console.error("[LIVE CALLBACK ERROR]:", err);
          setStatus(OrbStatus.ERROR);
          setIsMonitoring(false);
          isBusyRef.current = false;
          setTimeout(() => setStatus(OrbStatus.IDLE), 3000);
        }
      });
    } else {
      liveServiceRef.current?.disconnect();
      setStatus(OrbStatus.IDLE);
      isBusyRef.current = false;
      textQueueRef.current = [];
    }
  }, [isMonitoring, selectedLanguage, selectedVoice, systemPrompt, processNextInQueue]);

  useEffect(() => {
    let tid: any;
    const poll = async () => {
      if (!meetingId || !isMonitoring) {
        tid = setTimeout(poll, 2000);
        return;
      }
      const cur = await fetchLatestTranscription(meetingId);
      if (cur && cur !== lastTextRef.current) {
        pollingIntervalRef.current = POLLING_INTERVAL_MIN;
        const delta = cur.replace(lastTextRef.current, '').trim();
        if (delta && delta.length > 2) {
          const h = btoa(encodeURIComponent(delta)).slice(-24);
          if (!seenHashesRef.current.has(h)) {
            seenHashesRef.current.add(h);
            textQueueRef.current.push(delta);
            processNextInQueue();
            if (seenHashesRef.current.size > 100) {
              const firstValue = seenHashesRef.current.values().next().value;
              if (firstValue !== undefined) seenHashesRef.current.delete(firstValue);
            }
          }
        }
        lastTextRef.current = cur;
      } else {
        pollingIntervalRef.current = Math.min(pollingIntervalRef.current + 100, POLLING_INTERVAL_MAX);
      }
      tid = setTimeout(poll, pollingIntervalRef.current);
    };
    poll();
    return () => clearTimeout(tid);
  }, [isMonitoring, meetingId, processNextInQueue]);

  const handleOrbMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    dragMouseDown(e);
    setIsPressed(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    pressStartPosRef.current = { x: clientX, y: clientY, time: Date.now() };
  };

  const handleOrbMouseUp = useCallback(async (e: MouseEvent | TouchEvent) => {
    setIsPressed(false);
    if (!pressStartPosRef.current) return;
    const clientX = 'touches' in e ? (e as TouchEvent).changedTouches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as TouchEvent).changedTouches[0].clientY : (e as MouseEvent).clientY;
    const dx = Math.abs(clientX - pressStartPosRef.current.x);
    const dy = Math.abs(clientY - pressStartPosRef.current.y);
    const dt = Date.now() - pressStartPosRef.current.time;

    if (dx < 10 && dy < 10 && dt < 250) {
      if (!meetingId) setIsSidebarOpen(true);
      else setIsMonitoring(prev => !prev);
    }
    pressStartPosRef.current = null;
  }, [meetingId, ensureUserAccount]);

  useEffect(() => {
    window.addEventListener('mouseup', handleOrbMouseUp);
    window.addEventListener('touchend', handleOrbMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleOrbMouseUp);
      window.removeEventListener('touchend', handleOrbMouseUp);
    };
  }, [handleOrbMouseUp]);

  const saveSettings = () => {
    localStorage.setItem('orb_lang', selectedLanguage);
    localStorage.setItem('orb_voice', selectedVoice);
    localStorage.setItem('orb_meeting_id', meetingId);
    localStorage.setItem('orb_prompt', systemPrompt);
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2000);
  };

  const appDomain = GET_APP_DOMAIN();
  const embedCode = `<iframe 
  src="${appDomain}" 
  width="100%" 
  height="100%" 
  frameborder="0" 
  style="position:fixed; top:0; left:0; width:100vw; height:100vh; border:none; z-index:999999; pointer-events:none; background:transparent;" 
  allow="autoplay"
></iframe>`;

  const copyEmbedCode = () => {
    navigator.clipboard.writeText(embedCode);
    alert('ORB Widget code copied!');
  };

  return (
    <div className="fixed inset-0 pointer-events-none text-white font-sans bg-transparent">
      {/* Settings Toggle */}
      <div className="absolute top-0 right-0 p-6 pointer-events-auto z-50">
        <button 
          onClick={() => setIsSidebarOpen(true)} 
          className="p-3 rounded-2xl bg-slate-950/90 hover:bg-slate-900 border border-white/20 transition-all backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.6)] group ring-1 ring-white/10"
        >
          <svg className="w-6 h-6 text-cyan-400 group-hover:rotate-90 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Resizable Modal Node */}
      {isSidebarOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] p-4 pointer-events-none">
          <div 
            className="resizable-modal bg-slate-950/98 backdrop-blur-[60px] border-2 border-white/20 transform transition-all pointer-events-auto shadow-[0_40px_100px_rgba(0,0,0,0.9)] flex flex-col rounded-[2.5rem] overflow-hidden"
            style={{ 
              width: '440px', 
              height: '85vh', 
              minWidth: '340px', 
              minHeight: '600px', 
              resize: 'both' 
            }}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center p-8 shrink-0 border-b border-white/10 bg-black/40">
              <div className="flex flex-col">
                <h2 className="text-2xl font-black text-cyan-400 tracking-tighter uppercase italic leading-none drop-shadow-sm">Matrix Prime</h2>
                <span className="text-[10px] text-cyan-400/60 mt-2 font-mono tracking-[0.3em] uppercase">{appDomain.replace(/^https?:\/\//, '')}</span>
              </div>
              <button 
                onClick={() => setIsSidebarOpen(false)} 
                className="p-3 rounded-2xl bg-white/5 text-white/40 hover:text-white hover:bg-rose-500/20 transition-all border border-white/5"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto space-y-8 p-8 custom-scrollbar">
              
              {/* Neural Identity Display */}
              <div className="bg-slate-900/60 p-6 rounded-[2rem] border border-white/10">
                <div className="flex justify-between items-center mb-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Neural Identity (User UUID)</label>
                  <button 
                    onClick={() => ensureUserAccount(true)}
                    className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${regFeedback ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
                  >
                    {regFeedback ? 'Registered' : 'Register Identity'}
                  </button>
                </div>
                <div className="bg-black/40 p-4 rounded-xl border border-white/5 font-mono text-[11px] text-cyan-400/80 break-all leading-tight">
                  {userId || 'Awaiting Initialization...'}
                </div>
                <p className="mt-3 text-[9px] text-white/20 italic">This ID is saved in your 'users' table on Supabase.</p>
              </div>

              {/* Manual Injector */}
              <div className="bg-gradient-to-br from-cyan-500/20 to-blue-600/20 p-6 rounded-[2rem] border border-cyan-500/40 shadow-inner">
                <label className="block text-[11px] font-black text-cyan-300 uppercase tracking-[0.25em] mb-4">Neural Override</label>
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    value={testText} 
                    onChange={(e) => setTestText(e.target.value)} 
                    onKeyDown={(e) => { if(e.key === 'Enter' && testText) { textQueueRef.current.push(testText); processNextInQueue(); setTestText(''); } }} 
                    className="flex-1 bg-black/70 border border-white/20 rounded-2xl px-5 py-4 text-sm text-cyan-50 placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-cyan-500/60 transition-all shadow-xl" 
                    placeholder="Enter manual sequence..." 
                  />
                  <button 
                    onClick={() => { if(testText) { textQueueRef.current.push(testText); processNextInQueue(); setTestText(''); } }} 
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 p-4 rounded-2xl transition-all active:scale-90 shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"/></svg>
                  </button>
                </div>
              </div>

              {/* Settings Grid */}
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1 opacity-70">Transcribe Stream ID (meeting_id)</label>
                  <input type="text" value={meetingId} onChange={(e) => setMeetingId(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-mono shadow-inner text-cyan-100" placeholder="e.g. f47ac10b-..." />
                  <p className="mt-2 text-[9px] text-white/20 px-1 italic">Enter the meeting_id from your Supabase 'transcriptions' table.</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1 opacity-70">Linguistics</label>
                    <select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all appearance-none shadow-inner cursor-pointer">
                      {LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-slate-900">{l.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1 opacity-70">Synthesizer</label>
                    <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all appearance-none shadow-inner cursor-pointer">
                      {GREEK_VOICES.map(v => <option key={v.id} value={v.id} className="bg-slate-900">{v.name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1 opacity-70">Neural Heuristics</label>
                  <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="w-full h-28 bg-white/5 border border-white/20 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all resize-none shadow-inner leading-relaxed" />
                </div>
              </div>

              <button 
                onClick={saveSettings} 
                className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-[0.4em] transition-all shadow-2xl active:scale-95 border ${saveFeedback ? 'bg-emerald-500 border-emerald-400 text-white shadow-emerald-500/30' : 'bg-cyan-600/10 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/20 shadow-cyan-500/20'}`}
              >
                {saveFeedback ? 'Sequence Saved' : 'Synchronize Matrix'}
              </button>

              {/* Deployment Info */}
              <div className="pt-10 border-t border-white/10">
                <div className="flex justify-between items-center mb-4">
                  <label className="block text-[10px] font-black text-cyan-400 uppercase tracking-[0.25em]">Widget Embed</label>
                  <button onClick={copyEmbedCode} className="text-[10px] text-cyan-400 hover:text-white font-black uppercase tracking-widest bg-cyan-500/20 px-4 py-2 rounded-xl border border-cyan-500/40 transition-all active:scale-90">Copy Code</button>
                </div>
                <div className="bg-black/60 p-5 rounded-[1.5rem] border border-white/10 shadow-inner">
                  <div className="text-[10px] font-mono text-white/40 break-all max-h-24 overflow-y-auto leading-relaxed">
                    {embedCode}
                  </div>
                </div>
              </div>

              {/* Logs */}
              <div className="pt-10 border-t border-white/10">
                <div className="flex justify-between items-center mb-6">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] opacity-70">Memory Bank</label>
                  <button onClick={() => { setHistory([]); localStorage.removeItem('orb_history'); }} className="text-[10px] text-rose-500/60 hover:text-rose-500 font-black uppercase tracking-tighter transition-colors">Purge History</button>
                </div>
                <div className="space-y-5">
                  {history.length > 0 ? history.map((entry) => (
                    <div key={entry.id} className="group bg-white/5 rounded-[1.5rem] p-5 border border-white/5 hover:border-cyan-500/30 transition-all hover:bg-white/[0.07] shadow-lg">
                      <div className="text-[11px] text-white/30 mb-3 leading-snug italic font-medium">"{entry.originalText}"</div>
                      <div className="text-sm text-cyan-200 font-bold leading-relaxed">{entry.translatedText}</div>
                    </div>
                  )) : (
                    <div className="text-center py-12 text-[10px] text-white/20 uppercase tracking-[0.3em] font-black italic">No records active</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating ORB */}
      <div 
        className="pointer-events-auto absolute" 
        style={{ 
          left: position.x, 
          top: position.y, 
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' 
        }}
      >
        <Orb status={status} analyser={analyserRef.current} onMouseDown={handleOrbMouseDown} isDragging={isDragging} isPressed={isPressed} isMonitoring={isMonitoring} />
        {meetingId && (
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/80 rounded-full border border-white/20 text-[10px] font-black text-cyan-400 whitespace-nowrap uppercase tracking-[0.3em] backdrop-blur-xl shadow-2xl ring-1 ring-white/10">
            {meetingId}
          </div>
        )}
      </div>

      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)} 
          className="fixed inset-0 bg-black/70 backdrop-blur-md pointer-events-auto z-[55] transition-opacity duration-700" 
        />
      )}
    </div>
  );
};

export default App;