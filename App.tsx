
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OrbStatus, AudioSegment, HistoryEntry } from './types';
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

  // Translation Captured state (accumulates during a turn)
  const currentTranslationRef = useRef<string>('');
  const currentOriginalRef = useRef<string>('');

  const ensureUserAccount = useCallback(async () => {
    let currentId = userId;
    if (!currentId) {
      currentId = crypto.randomUUID();
      localStorage.setItem('orb_user_id', currentId);
      setUserId(currentId);
      await registerUser(currentId);
    }
    return currentId;
  }, [userId]);

  // Process the queue sequentially
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
    const service = new GeminiLiveService(process.env.API_KEY || '');
    liveServiceRef.current = service;
    analyserRef.current = service.getAnalyser();
    return () => service.disconnect();
  }, []);

  // Sync monitoring state with Live Session
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
          // Only move to IDLE if the turn is also complete
          if (!currentTurnActiveRef.current) {
            setStatus(OrbStatus.IDLE);
          }
        },
        onTurnComplete: () => {
          // Turn finished. Add to history.
          if (currentTranslationRef.current) {
            const newEntry: HistoryEntry = {
              id: Math.random().toString(36).substring(7),
              originalText: currentOriginalRef.current,
              translatedText: currentTranslationRef.current,
              timestamp: Date.now()
            };
            setHistory(prev => [newEntry, ...prev].slice(0, 50));
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

  // Supabase Polling
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
            if (seenHashesRef.current.size > 100) seenHashesRef.current.delete(seenHashesRef.current.values().next().value);
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
      await ensureUserAccount();
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

  return (
    <div className="fixed inset-0 pointer-events-none text-white font-sans">
      <div className="absolute top-0 right-0 p-6 pointer-events-auto z-50">
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 rounded-full bg-slate-900/60 hover:bg-slate-800/80 border border-white/10 transition-all backdrop-blur-md">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
      </div>

      <div className={`fixed top-0 right-0 h-full w-80 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 p-8 transform transition-transform duration-300 ease-in-out pointer-events-auto z-[60] flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex justify-between items-center mb-8 shrink-0">
          <h2 className="text-xl font-bold text-cyan-400">Configuration</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="text-white/60 hover:text-white"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
          <div className="bg-cyan-500/5 p-4 rounded-xl border border-cyan-500/20">
            <label className="block text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-2">Instant Test</label>
            <div className="flex gap-2">
              <input type="text" value={testText} onChange={(e) => setTestText(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') { textQueueRef.current.push(testText); processNextInQueue(); setTestText(''); } }} className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-cyan-500 transition-colors" placeholder="Type to speak..." />
              <button onClick={() => { textQueueRef.current.push(testText); processNextInQueue(); setTestText(''); }} className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 p-2 rounded-lg transition-colors"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"/></svg></button>
            </div>
          </div>

          <div><label className="block text-[10px] font-bold text-cyan-500/80 uppercase tracking-widest mb-1.5">User ID</label><div className="text-[9px] font-mono text-white/30 break-all bg-black/20 p-2 rounded border border-white/5">{userId || 'Tap ORB to activate'}</div></div>
          <div><label className="block text-[10px] font-bold text-cyan-500/80 uppercase tracking-widest mb-1.5">Meeting ID</label><input type="text" value={meetingId} onChange={(e) => setMeetingId(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500 transition-colors" /></div>
          <div><label className="block text-[10px] font-bold text-cyan-500/80 uppercase tracking-widest mb-1.5">Language</label><select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500 transition-colors">{LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-slate-900">{l.name}</option>)}</select></div>
          <div><label className="block text-[10px] font-bold text-cyan-500/80 uppercase tracking-widest mb-1.5">Voice Persona</label><select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500 transition-colors">{GREEK_VOICES.map(v => <option key={v.id} value={v.id} className="bg-slate-900">{v.name}</option>)}</select></div>
          <div><label className="block text-[10px] font-bold text-cyan-500/80 uppercase tracking-widest mb-1.5">Instruction Context</label><textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="w-full h-20 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cyan-500 transition-colors resize-none" /></div>

          <button onClick={saveSettings} className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${saveFeedback ? 'bg-emerald-500 text-white' : 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30'}`}>{saveFeedback ? 'Settings Saved!' : 'Save Configuration'}</button>

          <div className="pt-6 border-t border-white/10">
            <div className="flex justify-between items-center mb-4"><label className="block text-[10px] font-bold text-cyan-500/80 uppercase tracking-widest">History</label><button onClick={() => setHistory([])} className="text-[9px] text-white/40 hover:text-rose-400 uppercase tracking-tighter">Clear</button></div>
            <div className="space-y-3">{history.map((entry) => (<div key={entry.id} className="bg-white/5 rounded-lg p-3 border border-white/5 hover:border-cyan-500/30 transition-all"><div className="text-[10px] text-white/60 mb-1 leading-tight">{entry.originalText}</div><div className="text-xs text-cyan-400 font-medium leading-tight">{entry.translatedText}</div></div>))}</div>
          </div>
        </div>
      </div>

      <div className="pointer-events-auto absolute" style={{ left: position.x, top: position.y, transition: isDragging ? 'none' : 'transform 0.1s ease-out' }}>
        <Orb status={status} analyser={analyserRef.current} onMouseDown={handleOrbMouseDown} isDragging={isDragging} isPressed={isPressed} isMonitoring={isMonitoring} />
        {meetingId && <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-cyan-400/60 whitespace-nowrap uppercase tracking-widest">{meetingId}</div>}
      </div>

      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto z-[55]" />}
    </div>
  );
};

export default App;
