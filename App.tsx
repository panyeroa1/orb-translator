
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OrbStatus, HistoryEntry, Language } from './types';
import {
  POLLING_INTERVAL_MIN,
  POLLING_INTERVAL_MAX,
  LANGUAGES as FALLBACK_LANGUAGES,
  GREEK_VOICES as FALLBACK_VOICES
} from './constants';
import { useDraggable } from './hooks/useDraggable';
import Orb from './components/Orb';
import { GeminiLiveService } from './services/geminiService';
import { 
  fetchLatestTranscription, 
  getOrbitKeys,
  addOrbitKey
} from './services/supabaseService';

const DEFAULT_TEST_TEXT = `Welcome to Orbit, the real-time translation and voice experience developed under the Success Class by Eburon initiative.
This platform is designed to remove language barriers without changing meaning, emotion, or intent.
Every word you hear must remain faithful to the original message.
No simplification. No censorship. No loss of tone.
Orbit is used in live classrooms, professional training, and real-world communication where accuracy matters.
When a teacher speaks, the students listen in their own language — clearly, naturally, and instantly.
Success Class by Eburon exists to empower people through understanding, not shortcuts.
Knowledge should travel freely, across borders, accents, and cultures.
This is not just translation.
This is voice, context, and human nuance — delivered in real time.`;

const App: React.FC = () => {
  const [status, setStatus] = useState<OrbStatus>(OrbStatus.IDLE);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Key Rotation State
  const [orbitKeys, setOrbitKeys] = useState<string[]>([]);
  const [currentKeyIndex, setCurrentKeyIndex] = useState(0);
  const [newOrbitToken, setNewOrbitToken] = useState('');
  const [isAddingToken, setIsAddingToken] = useState(false);
  
  const [availableLanguages, setAvailableLanguages] = useState<Language[]>(FALLBACK_LANGUAGES);
  const [availableVoices, setAvailableVoices] = useState<{id: string, name: string}[]>(FALLBACK_VOICES);
  const [selectedLanguage, setSelectedLanguage] = useState(() => localStorage.getItem('orb_lang') || 'en-tl');
  const [selectedVoice, setSelectedVoice] = useState(() => localStorage.getItem('orb_voice') || 'Orus');
  const [meetingId, setMeetingId] = useState(() => localStorage.getItem('orb_meeting_id') || '43f847a2-6836-4d5f-b16e-bf67f12972e5');
  const [testText, setTestText] = useState(DEFAULT_TEST_TEXT);
  
  const textQueueRef = useRef<string[]>([]);
  const isBusyRef = useRef<boolean>(false);
  const lastProcessedTextRef = useRef<string | null>(null);
  const liveServiceRef = useRef<GeminiLiveService | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pollingTimerRef = useRef<number | null>(null);
  
  const { position, isDragging, handleMouseDown: dragMouseDown } = useDraggable(100, 200);

  const rotateKeyAndReconnect = useCallback(async () => {
    if (orbitKeys.length === 0) return;
    const nextIdx = (currentKeyIndex + 1) % orbitKeys.length;
    setCurrentKeyIndex(nextIdx);
    if (liveServiceRef.current) {
      liveServiceRef.current.updateApiKey(orbitKeys[nextIdx]);
    }
  }, [orbitKeys, currentKeyIndex]);

  const loadOrbitKeys = useCallback(async () => {
    const keys = await getOrbitKeys();
    setOrbitKeys(keys);
    if (keys.length > 0 && liveServiceRef.current) {
      liveServiceRef.current.updateApiKey(keys[0]);
    }
  }, []);

  const handleAddToken = async () => {
    if (!newOrbitToken) return;
    setIsAddingToken(true);
    const success = await addOrbitKey(newOrbitToken);
    if (success) {
      setNewOrbitToken('');
      await loadOrbitKeys();
      alert("Orbit Token Injected.");
    } else {
      alert("Orbit persistence failure.");
    }
    setIsAddingToken(false);
  };

  const processNextInQueue = useCallback(async () => {
    if (isBusyRef.current || textQueueRef.current.length === 0 || !liveServiceRef.current) return;
    
    isBusyRef.current = true;
    const text = textQueueRef.current.shift()!;
    setStatus(OrbStatus.BUFFERING);
    
    const langName = availableLanguages.find(l => l.code === selectedLanguage)?.name || 'English';
    console.log(`[ORBIT]: Synthesizing Matrix Turn...`);

    const callbacks = {
      onTranscription: (text: string) => {},
      onAudioStarted: () => setStatus(OrbStatus.SPEAKING),
      onAudioEnded: () => {},
      onTurnComplete: () => {
        setStatus(OrbStatus.IDLE);
        isBusyRef.current = false;
        // Small delay to prevent overlap
        setTimeout(() => processNextInQueue(), 100);
      },
      onError: (err: any) => {
        const msg = err?.message?.toLowerCase() || "";
        if (msg.includes("429") || msg.includes("quota") || msg.includes("limit")) {
          setErrorMessage("Orbit Limit Exceeded. Rotating...");
          rotateKeyAndReconnect();
        } else {
          setErrorMessage("Orbit Interface Error.");
          console.error("[ORBIT CRITICAL]:", err);
        }
        setStatus(OrbStatus.ERROR);
        isBusyRef.current = false;
        setTimeout(() => {
          setErrorMessage(null);
          setStatus(OrbStatus.IDLE);
          processNextInQueue();
        }, 5000);
      }
    };

    liveServiceRef.current.sendText(text, langName, callbacks);
  }, [selectedLanguage, availableLanguages, rotateKeyAndReconnect]);

  const connectService = useCallback(() => {
    if (!liveServiceRef.current) return;
    liveServiceRef.current.connect(selectedLanguage, selectedVoice, {
      onTranscription: () => {},
      onAudioStarted: () => setStatus(OrbStatus.SPEAKING),
      onAudioEnded: () => {},
      onTurnComplete: () => {},
      onError: (err) => {
        setErrorMessage("Connection Error.");
        setStatus(OrbStatus.ERROR);
      }
    });
  }, [selectedLanguage, selectedVoice]);

  // Main Polling Effect
  useEffect(() => {
    if (!isMonitoring || !meetingId) {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      return;
    }

    console.log(`[ORBIT]: Polling Matrix for ID: ${meetingId}`);
    
    const poll = async () => {
      const latestText = await fetchLatestTranscription(meetingId);
      if (latestText && latestText !== lastProcessedTextRef.current) {
        lastProcessedTextRef.current = latestText;
        textQueueRef.current.push(latestText);
        processNextInQueue();
      }
    };

    poll();
    const interval = Math.floor(Math.random() * (POLLING_INTERVAL_MAX - POLLING_INTERVAL_MIN) + POLLING_INTERVAL_MIN);
    pollingTimerRef.current = window.setInterval(poll, interval);

    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [isMonitoring, meetingId, processNextInQueue]);

  const handleTestSpeech = () => {
    if (!testText.trim()) return;
    if (!isMonitoring) {
      setErrorMessage("Orbit System Not Active.");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }
    textQueueRef.current.push(testText);
    processNextInQueue();
  };

  useEffect(() => {
    loadOrbitKeys();
    const service = new GeminiLiveService();
    liveServiceRef.current = service;
    analyserRef.current = service.getAnalyser();
    return () => service.disconnect();
  }, []);

  useEffect(() => {
    if (isMonitoring) connectService();
    else liveServiceRef.current?.disconnect();
  }, [isMonitoring, connectService]);

  const handleOrbMouseDown = (e: any) => {
    dragMouseDown(e);
    const dt = Date.now();
    const endHandler = (upE: any) => {
      window.removeEventListener('mouseup', endHandler);
      window.removeEventListener('touchend', endHandler);
      if (Date.now() - dt < 200) {
        if (!meetingId && !isMonitoring) {
          setIsSidebarOpen(true);
        } else {
          setIsMonitoring(prev => !prev);
        }
      }
    };
    window.addEventListener('mouseup', endHandler);
    window.addEventListener('touchend', endHandler);
  };

  return (
    <div className="fixed inset-0 pointer-events-none text-white font-sans bg-transparent">
      {errorMessage && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-rose-600 px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest animate-bounce shadow-2xl z-[100]">
          {errorMessage}
        </div>
      )}

      {isSidebarOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] p-4 pointer-events-none">
          <div className="resizable-modal bg-slate-950/98 backdrop-blur-[60px] border-2 border-white/20 transform transition-all pointer-events-auto shadow-[0_40px_100px_rgba(0,0,0,0.9)] flex flex-col rounded-[2.5rem] overflow-hidden w-[440px] h-[85vh]">
            <div className="flex justify-between items-center p-8 shrink-0 border-b border-white/10 bg-black/40">
              <h2 className="text-2xl font-black text-cyan-400 tracking-tighter uppercase italic drop-shadow-sm">Matrix Prime</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="p-3 rounded-2xl bg-white/5 text-white/40 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-8 p-8 custom-scrollbar">
              <div className="bg-slate-900/60 p-6 rounded-[2rem] border border-cyan-500/20">
                <label className="block text-[10px] font-black text-cyan-400 uppercase tracking-[0.25em] mb-4">Add Orbit Token</label>
                <div className="flex gap-2">
                  <input 
                    type="password" 
                    value={newOrbitToken} 
                    onChange={e => setNewOrbitToken(e.target.value)} 
                    placeholder="Enter key..." 
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono outline-none focus:border-cyan-500/50 transition-all" 
                  />
                  <button 
                    disabled={isAddingToken} 
                    onClick={handleAddToken} 
                    className="bg-cyan-500 text-black px-4 py-3 rounded-xl font-black text-[10px] uppercase hover:bg-cyan-400 transition-all disabled:opacity-50"
                  >
                    {isAddingToken ? '...' : 'Inject'}
                  </button>
                </div>
                <div className="mt-2 text-[9px] text-white/30 italic">Token Pool: {orbitKeys.length} | Slot: {currentKeyIndex + 1}</div>
              </div>

              <div className="bg-purple-900/20 p-6 rounded-[2rem] border border-purple-500/30">
                <label className="block text-[10px] font-black text-purple-400 uppercase tracking-[0.25em] mb-4">Synthesis Verification</label>
                <div className="space-y-3">
                  <textarea 
                    value={testText} 
                    onChange={e => setTestText(e.target.value)} 
                    placeholder="Enter text to translate..." 
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs min-h-[120px] focus:border-purple-500/50 outline-none transition-all" 
                  />
                  <button 
                    onClick={handleTestSpeech} 
                    className="w-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-purple-900/40"
                  >
                    Trigger Voice Engine
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Stream ID</label>
                <input type="text" value={meetingId} onChange={e => setMeetingId(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-2xl px-5 py-4 text-sm font-mono shadow-inner text-cyan-100 outline-none focus:border-cyan-500/50" placeholder="meeting_id" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Linguistics</label>
                  <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-2xl px-5 py-4 text-sm appearance-none cursor-pointer outline-none">
                    {availableLanguages.map(l => <option key={l.code} value={l.code} className="bg-slate-900">{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Synthesizer</label>
                  <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-2xl px-5 py-4 text-sm appearance-none cursor-pointer outline-none">
                    {availableVoices.map(v => <option key={v.id} value={v.id} className="bg-slate-900">{v.name}</option>)}
                  </select>
                </div>
              </div>

              <button 
                onClick={() => {
                  localStorage.setItem('orb_lang', selectedLanguage);
                  localStorage.setItem('orb_voice', selectedVoice);
                  localStorage.setItem('orb_meeting_id', meetingId);
                  setSaveFeedback(true);
                  setTimeout(() => setSaveFeedback(false), 2000);
                }} 
                className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-[0.4em] transition-all border ${saveFeedback ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-cyan-600/10 border-cyan-500/40 text-cyan-400'}`}
              >
                {saveFeedback ? 'Sequence Saved' : 'Sync Matrix'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-auto absolute" style={{ left: position.x, top: position.y }}>
        <Orb 
          status={status} 
          analyser={analyserRef.current} 
          onMouseDown={handleOrbMouseDown} 
          onSettingsClick={() => setIsSidebarOpen(true)}
          isDragging={isDragging} 
          isPressed={false} 
          isMonitoring={isMonitoring} 
        />
      </div>

      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/70 backdrop-blur-md pointer-events-auto z-[55]" />}
    </div>
  );
};

export default App;
