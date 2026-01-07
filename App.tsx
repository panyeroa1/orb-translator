
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

const APP_DOMAIN = "https://translate.eburon.ai";

const App: React.FC = () => {
  const [status, setStatus] = useState<OrbStatus>(OrbStatus.IDLE);
  const [isPressed, setIsPressed] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);
  
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

  const ensureUserAccount = useCallback(async () => {
    let currentId = localStorage.getItem('orb_user_id') || userId;
    if (!currentId) {
      currentId = crypto.randomUUID();
      localStorage.setItem('orb_user_id', currentId);
      setUserId(currentId);
      await registerUser(currentId);
    } else if (!userId) {
      setUserId(currentId);
    }
    return currentId;
  }, [userId]);

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
      const storedUserId = localStorage.getItem('orb_user_id');
      if (!storedUserId) await ensureUserAccount();
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

  // Proper Iframe Embed Code for widget-like behavior
  const embedCode = `<iframe 
  src="${APP_DOMAIN}" 
  width="100%" 
  height="100%" 
  frameborder="0" 
  style="position:fixed; top:0; left:0; width:100vw; height:100vh; border:none; z-index:999999; pointer-events:none; background:transparent;" 
  allow="autoplay"
></iframe>`;

  const copyEmbedCode = () => {
    navigator.clipboard.writeText(embedCode);
    alert('ORB Widget code copied! Paste this inside the <body> of your page.');
  };

  return (
    <div className="fixed inset-0 pointer-events-none text-white font-sans bg-transparent">
      {/* Settings Toggle */}
      <div className="absolute top-0 right-0 p-6 pointer-events-auto z-50">
        <button 
          onClick={() => setIsSidebarOpen(true)} 
          className="p-2 rounded-full bg-slate-900/60 hover:bg-slate-800/80 border border-white/10 transition-all backdrop-blur-md shadow-xl"
        >
          <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Resizable Modal Node */}
      {isSidebarOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] p-4 pointer-events-none">
          <div 
            className="resizable-modal bg-slate-900/98 backdrop-blur-3xl border border-white/10 transform transition-all pointer-events-auto shadow-[-20px_0_50px_rgba(0,0,0,0.5)] flex flex-col rounded-3xl overflow-hidden"
            style={{ 
              width: '400px', 
              height: '80vh', 
              minWidth: '320px', 
              minHeight: '450px', 
              resize: 'both' 
            }}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 shrink-0 border-b border-white/10 bg-black/20">
              <div className="flex flex-col">
                <h2 className="text-xl font-black text-cyan-400 tracking-tighter uppercase italic leading-none">Control Matrix</h2>
                <span className="text-[9px] text-cyan-400/50 mt-1 font-mono tracking-widest uppercase">translate.eburon.ai</span>
              </div>
              <button 
                onClick={() => setIsSidebarOpen(false)} 
                className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto space-y-7 p-6 custom-scrollbar">
              <div className="bg-gradient-to-br from-cyan-500/10 to-blue-600/10 p-5 rounded-2xl border border-cyan-500/30 shadow-inner">
                <label className="block text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em] mb-3">Live Feed Injector</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={testText} 
                    onChange={(e) => setTestText(e.target.value)} 
                    onKeyDown={(e) => { if(e.key === 'Enter' && testText) { textQueueRef.current.push(testText); processNextInQueue(); setTestText(''); } }} 
                    className="flex-1 bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-xs text-cyan-50 placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all" 
                    placeholder="Manual override text..." 
                  />
                  <button 
                    onClick={() => { if(testText) { textQueueRef.current.push(testText); processNextInQueue(); setTestText(''); } }} 
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 p-3 rounded-xl transition-all active:scale-90 shadow-lg shadow-cyan-500/20"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"/></svg>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 opacity-60">Identity Signature</label><div className="text-[10px] font-mono text-cyan-200/50 break-all bg-white/5 p-3 rounded-xl border border-white/5 shadow-inner">{userId || 'Awaiting activation...'}</div></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 opacity-60">Meeting Target ID</label><input type="text" value={meetingId} onChange={(e) => setMeetingId(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all" placeholder="e.g. ALPHA-9" /></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 opacity-60">Target Language</label><select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all appearance-none">{LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-slate-900">{l.name}</option>)}</select></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 opacity-60">Vocal Matrix</label><select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all appearance-none">{GREEK_VOICES.map(v => <option key={v.id} value={v.id} className="bg-slate-900">{v.name}</option>)}</select></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 opacity-60">Core Heuristics</label><textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="w-full h-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all resize-none scrollbar-hide" /></div>
              </div>

              <button 
                onClick={saveSettings} 
                className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all shadow-lg active:scale-95 ${saveFeedback ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 shadow-cyan-500/10'}`}
              >
                {saveFeedback ? 'Matrix Synced' : 'Commit Configuration'}
              </button>

              {/* Enhanced Embed Code Section */}
              <div className="pt-8 border-t border-white/10">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em]">Deployment Code</label>
                  <button onClick={copyEmbedCode} className="text-[9px] text-cyan-400 hover:text-white font-black uppercase tracking-widest bg-cyan-500/10 px-2 py-1 rounded transition-colors">Copy Widget</button>
                </div>
                <div className="relative group">
                  <div className="text-[9px] font-mono text-white/40 bg-black/40 p-3 rounded-xl border border-white/5 break-all max-h-32 overflow-y-auto leading-relaxed">
                    {embedCode}
                  </div>
                </div>
                <p className="mt-2 text-[8px] text-white/30 uppercase tracking-[0.1em] text-center italic">
                  * Iframe is fixed full-screen with pointer transparency.
                </p>
              </div>

              <div className="pt-8 border-t border-white/10">
                <div className="flex justify-between items-center mb-5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] opacity-60">Log History</label>
                  <button onClick={() => { setHistory([]); localStorage.removeItem('orb_history'); }} className="text-[10px] text-rose-400/60 hover:text-rose-400 font-black uppercase tracking-tighter transition-colors">Wipe Memory</button>
                </div>
                <div className="space-y-4">
                  {history.length > 0 ? history.map((entry) => (
                    <div key={entry.id} className="group bg-white/5 rounded-2xl p-4 border border-white/5 hover:border-cyan-500/40 transition-all hover:translate-x-1">
                      <div className="text-[10px] text-white/40 mb-2 leading-tight font-medium italic">"{entry.originalText}"</div>
                      <div className="text-xs text-cyan-300 font-bold leading-relaxed">{entry.translatedText}</div>
                    </div>
                  )) : (
                    <div className="text-center py-10 text-[10px] text-white/20 uppercase tracking-widest font-black italic">No records found</div>
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
          transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)' 
        }}
      >
        <Orb status={status} analyser={analyserRef.current} onMouseDown={handleOrbMouseDown} isDragging={isDragging} isPressed={isPressed} isMonitoring={isMonitoring} />
        {meetingId && (
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/40 rounded-full border border-white/5 text-[9px] font-black text-cyan-400/80 whitespace-nowrap uppercase tracking-[0.2em] backdrop-blur-md">
            {meetingId}
          </div>
        )}
      </div>

      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)} 
          className="fixed inset-0 bg-black/60 backdrop-blur-md pointer-events-auto z-[55] transition-opacity duration-500" 
        />
      )}
    </div>
  );
};

export default App;
