
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
import { GeminiTranslator } from './services/geminiService';
import { fetchLatestTranscription, registerUser } from './services/supabaseService';

const App: React.FC = () => {
  const [status, setStatus] = useState<OrbStatus>(OrbStatus.IDLE);
  const [isPressed, setIsPressed] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Settings State
  const [selectedLanguage, setSelectedLanguage] = useState(() => localStorage.getItem('orb_lang') || 'en');
  const [selectedVoice, setSelectedVoice] = useState(() => localStorage.getItem('orb_voice') || 'Kore');
  const [meetingId, setMeetingId] = useState(() => localStorage.getItem('orb_meeting_id') || '');
  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem('orb_prompt') || 'Translate this text and output ONLY the translated audio. No explanations.');
  const [userId, setUserId] = useState(() => localStorage.getItem('orb_user_id') || '');
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    const saved = localStorage.getItem('orb_history');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Refs for logic
  const lastTextRef = useRef<string>('');
  const seenHashesRef = useRef<Set<string>>(new Set());
  const pollingIntervalRef = useRef<number>(POLLING_INTERVAL_MIN);
  
  // Audio Refs
  const audioQueueRef = useRef<AudioSegment[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const translatorRef = useRef<GeminiTranslator | null>(null);
  
  // Interaction Refs
  const pressStartPosRef = useRef<{x: number, y: number, time: number} | null>(null);

  const { position, isDragging, handleMouseDown: dragMouseDown } = useDraggable(100, 200);

  // Initialize Anonymous User
  const ensureUserAccount = useCallback(async () => {
    let currentId = userId;
    if (!currentId) {
      currentId = crypto.randomUUID();
      localStorage.setItem('orb_user_id', currentId);
      setUserId(currentId);
      await registerUser(currentId);
    }
  }, [userId]);

  useEffect(() => {
    const translator = new GeminiTranslator(process.env.API_KEY || '');
    translatorRef.current = translator;
    const ctx = translator.getAudioContext();
    audioContextRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    const resume = () => { if (ctx.state === 'suspended') ctx.resume(); };
    window.addEventListener('click', resume);
    window.addEventListener('touchstart', resume, { passive: false });
    return () => {
      window.removeEventListener('click', resume);
      window.removeEventListener('touchstart', resume);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('orb_history', JSON.stringify(history));
  }, [history]);

  const persistSettings = (key: string, value: string) => {
    localStorage.setItem(key, value);
  };

  const processAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    isPlayingRef.current = true;
    const segment = audioQueueRef.current.shift()!;
    setStatus(OrbStatus.SPEAKING);
    const ctx = audioContextRef.current!;
    const source = ctx.createBufferSource();
    source.buffer = segment.audioBuffer;
    source.connect(analyserRef.current!);
    analyserRef.current!.connect(ctx.destination);
    source.onended = () => {
      isPlayingRef.current = false;
      setStatus(OrbStatus.IDLE);
      processAudioQueue();
    };
    source.start(0);
  }, []);

  const commitSegment = useCallback(async (text: string) => {
    const cleanText = text.trim();
    if (cleanText.length < 3) return;
    
    try {
      if (!translatorRef.current) {
        throw new Error("Translation service not initialized.");
      }

      setStatus(OrbStatus.TRANSLATING);
      const langName = LANGUAGES.find(l => l.code === selectedLanguage)?.name || 'English';
      
      const { audioBuffer, translatedText } = await translatorRef.current.translateAndSpeak(
        cleanText, 
        langName, 
        systemPrompt,
        selectedVoice
      );
      
      if (!audioBuffer) {
        throw new Error("Gemini returned empty audio.");
      }

      // Add to history
      const newEntry: HistoryEntry = {
        id: Math.random().toString(36).substring(7),
        originalText: cleanText,
        translatedText,
        timestamp: Date.now()
      };
      setHistory(prev => [newEntry, ...prev].slice(0, 50)); // Keep last 50 entries

      audioQueueRef.current.push({
        id: newEntry.id,
        text: cleanText,
        audioBuffer
      });
      processAudioQueue();
    } catch (err: any) {
      console.error("[ORB ERROR]:", err);
      setStatus(OrbStatus.ERROR);
      setTimeout(() => setStatus(OrbStatus.IDLE), 3000);
    }
  }, [selectedLanguage, selectedVoice, systemPrompt, processAudioQueue]);

  // Polling logic
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
        
        if (delta) {
          const h = btoa(encodeURIComponent(delta)).slice(-24);
          if (!seenHashesRef.current.has(h)) {
            seenHashesRef.current.add(h);
            commitSegment(delta);
            if (seenHashesRef.current.size > 100) {
              const [first] = seenHashesRef.current;
              seenHashesRef.current.delete(first);
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
  }, [isMonitoring, meetingId, commitSegment]);

  // Handle tap interaction
  const handleOrbMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    dragMouseDown(e);
    setIsPressed(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    pressStartPosRef.current = { x: clientX, y: clientY, time: Date.now() };
    
    // Ensure user account on very first touch
    ensureUserAccount();
  };

  const handleOrbMouseUp = useCallback((e: MouseEvent | TouchEvent) => {
    setIsPressed(false);
    if (!pressStartPosRef.current) return;

    const clientX = 'touches' in e ? (e as TouchEvent).changedTouches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as TouchEvent).changedTouches[0].clientY : (e as MouseEvent).clientY;

    const dx = Math.abs(clientX - pressStartPosRef.current.x);
    const dy = Math.abs(clientY - pressStartPosRef.current.y);
    const dt = Date.now() - pressStartPosRef.current.time;

    if (dx < 10 && dy < 10 && dt < 250) {
      if (!meetingId) {
        setIsSidebarOpen(true);
        return;
      }
      setIsMonitoring(prev => !prev);
    }
    pressStartPosRef.current = null;
  }, [meetingId]);

  useEffect(() => {
    window.addEventListener('mouseup', handleOrbMouseUp);
    window.addEventListener('touchend', handleOrbMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleOrbMouseUp);
      window.removeEventListener('touchend', handleOrbMouseUp);
    };
  }, [handleOrbMouseUp]);

  return (
    <div className="fixed inset-0 pointer-events-none text-white font-sans">
      {/* Settings Toggle */}
      <div className="absolute top-0 right-0 p-6 pointer-events-auto z-50">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 rounded-full bg-slate-900/60 hover:bg-slate-800/80 border border-white/10 transition-all backdrop-blur-md"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Settings Sidebar */}
      <div className={`
        fixed top-0 right-0 h-full w-80 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 p-8
        transform transition-transform duration-300 ease-in-out pointer-events-auto z-[60] flex flex-col
        ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <div className="flex justify-between items-center mb-8 shrink-0">
          <h2 className="text-xl font-bold text-cyan-400">Configuration</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="text-white/60 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
          <div>
            <label className="block text-[10px] font-bold text-cyan-500/80 uppercase tracking-widest mb-1.5">User ID (Self)</label>
            <div className="text-[10px] font-mono text-white/40 break-all bg-black/20 p-2 rounded border border-white/5">
              {userId || 'Creating...'}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-cyan-500/80 uppercase tracking-widest mb-1.5">Meeting ID</label>
            <input 
              type="text"
              value={meetingId}
              onChange={(e) => { setMeetingId(e.target.value); persistSettings('orb_meeting_id', e.target.value); }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
              placeholder="e.g. room-101"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-cyan-500/80 uppercase tracking-widest mb-1.5">Target Language</label>
            <select 
              value={selectedLanguage}
              onChange={(e) => { setSelectedLanguage(e.target.value); persistSettings('orb_lang', e.target.value); }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
            >
              {LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-slate-900">{l.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-cyan-500/80 uppercase tracking-widest mb-1.5">Voice Persona</label>
            <select 
              value={selectedVoice}
              onChange={(e) => { setSelectedVoice(e.target.value); persistSettings('orb_voice', e.target.value); }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
            >
              {GREEK_VOICES.map(v => <option key={v.id} value={v.id} className="bg-slate-900">{v.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-cyan-500/80 uppercase tracking-widest mb-1.5">Prompt Context</label>
            <textarea 
              value={systemPrompt}
              onChange={(e) => { setSystemPrompt(e.target.value); persistSettings('orb_prompt', e.target.value); }}
              className="w-full h-24 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cyan-500 transition-colors resize-none"
              placeholder="Professional translator..."
            />
          </div>

          {/* History Section */}
          <div className="pt-6 border-t border-white/10">
            <div className="flex justify-between items-center mb-4">
              <label className="block text-[10px] font-bold text-cyan-500/80 uppercase tracking-widest">Recent History</label>
              <button 
                onClick={() => setHistory([])}
                className="text-[9px] text-white/40 hover:text-rose-400 uppercase tracking-tighter"
              >
                Clear
              </button>
            </div>
            
            <div className="space-y-3">
              {history.length === 0 ? (
                <div className="text-xs text-white/20 italic py-4 text-center">No segments recorded yet</div>
              ) : (
                history.map((entry) => (
                  <div key={entry.id} className="bg-white/5 rounded-lg p-3 border border-white/5 group hover:border-cyan-500/30 transition-all">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[8px] text-white/30 font-mono">
                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-[10px] text-white/60 mb-1 leading-tight">{entry.originalText}</div>
                    <div className="text-xs text-cyan-400 font-medium leading-tight">{entry.translatedText}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The ORB */}
      <div 
        className="pointer-events-auto absolute"
        style={{ 
          left: position.x, 
          top: position.y,
          transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}
      >
        <Orb
          status={status}
          analyser={analyserRef.current}
          onMouseDown={handleOrbMouseDown}
          isDragging={isDragging}
          isPressed={isPressed}
          isMonitoring={isMonitoring}
        />
        
        {/* Helper Label */}
        {meetingId && (
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-cyan-400/60 whitespace-nowrap uppercase tracking-widest">
            {meetingId}
          </div>
        )}
      </div>

      {/* Overlay for closing sidebar */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto z-[55]"
        />
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(34, 211, 238, 0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(34, 211, 238, 0.4); }
      `}</style>
    </div>
  );
};

export default App;
