
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { OrbStatus, HistoryEntry, Language, AppMode, TranscriptionEngine, InputSource } from './types';
import {
  POLLING_INTERVAL_MIN,
  POLLING_INTERVAL_MAX,
  LANGUAGES as FALLBACK_LANGUAGES,
  GREEK_VOICES as FALLBACK_VOICES,
  ORB_SIZE
} from './constants';
import { useDraggable } from './hooks/useDraggable';
import Orb from './components/Orb';
import { GeminiLiveService } from './services/geminiService';
import { TranscriptionService } from './services/transcriptionService';
import { 
  fetchLatestTranscription, 
  pushTranscription,
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
  // Detect if app is running in an iframe
  const isEmbedded = useMemo(() => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  }, []);

  const [status, setStatus] = useState<OrbStatus>(OrbStatus.IDLE);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<AppMode | 'embed'>('translate');
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentTranscriptionText, setCurrentTranscriptionText] = useState<string>("");
  const [fullTranscription, setFullTranscription] = useState<string>(() => localStorage.getItem('orb_full_transcript') || "");
  const [showSubtitles, setShowSubtitles] = useState<boolean>(() => localStorage.getItem('orb_show_subtitles') !== 'false');
  
  // Subtitle Progress State
  const [subtitleProgress, setSubtitleProgress] = useState(0);
  const [isSubtitleVisible, setIsSubtitleVisible] = useState(false);

  // Speaker Tab & Device Detection State
  const [transcriptionEngine, setTranscriptionEngine] = useState<TranscriptionEngine>(() => (localStorage.getItem('orb_engine') as TranscriptionEngine) || 'main');
  const [inputSource, setInputSource] = useState<InputSource>(() => (localStorage.getItem('orb_input') as InputSource) || 'mic');
  const [micStatus, setMicStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [screenStatus, setScreenStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [hasMicHardware, setHasMicHardware] = useState<boolean>(false);
  const [detectedDevices, setDetectedDevices] = useState<MediaDeviceInfo[]>([]);

  // Key Rotation State
  const [orbitKeys, setOrbitKeys] = useState<string[]>([]);
  const [currentKeyIndex, setCurrentKeyIndex] = useState(0);
  const [newOrbitToken, setNewOrbitToken] = useState('');
  const [isAddingToken, setIsAddingToken] = useState(false);
  
  const [availableLanguages, setAvailableLanguages] = useState<Language[]>(FALLBACK_LANGUAGES);
  const [availableVoices, setAvailableVoices] = useState<{id: string, name: string}[]>(FALLBACK_VOICES);
  const [selectedLanguage, setSelectedLanguage] = useState(() => localStorage.getItem('orb_lang') || 'en-tl');
  const [selectedVoice, setSelectedVoice] = useState(() => localStorage.getItem('orb_voice') || 'Zephyr');
  const [meetingId, setMeetingId] = useState(() => localStorage.getItem('orb_meeting_id') || '43f847a2-6836-4d5f-b16e-bf67f12972e5');
  const [testText, setTestText] = useState(DEFAULT_TEST_TEXT);
  
  const textQueueRef = useRef<string[]>([]);
  const isBusyRef = useRef<boolean>(false);
  const lastProcessedTextRef = useRef<string | null>(null);
  
  const liveServiceRef = useRef<GeminiLiveService | null>(null);
  const transcriptionServiceRef = useRef<TranscriptionService>(new TranscriptionService());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pollingTimerRef = useRef<number | null>(null);
  const errorTimeoutRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  
  // Initial position logic: if embedded, start bottom-right
  const initialX = isEmbedded ? window.innerWidth - ORB_SIZE - 40 : 100;
  const initialY = isEmbedded ? window.innerHeight - ORB_SIZE - 40 : 200;
  const { position, isDragging, handleMouseDown: dragMouseDown } = useDraggable(initialX, initialY);

  const triggerError = useCallback((msg: string) => {
    setErrorMessage(msg);
    setStatus(OrbStatus.ERROR);
    setIsMonitoring(false);
    if (errorTimeoutRef.current) window.clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = window.setTimeout(() => {
      setErrorMessage(null);
      setStatus(OrbStatus.IDLE);
    }, 5000);
  }, []);

  const refreshDeviceDetection = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === 'audioinput');
      setDetectedDevices(devices);
      setHasMicHardware(mics.length > 0);
      if (navigator.permissions && (navigator.permissions as any).query) {
        try {
          const micPermission = await (navigator.permissions as any).query({ name: 'microphone' });
          setMicStatus(micPermission.state);
        } catch(e) {}
      }
    } catch (e) {
      console.warn("[ORBIT]: Device enumeration failed.", e);
    }
  }, []);

  useEffect(() => {
    refreshDeviceDetection();
    navigator.mediaDevices.addEventListener('devicechange', refreshDeviceDetection);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDeviceDetection);
  }, [refreshDeviceDetection]);

  const authorizeMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicStatus('granted');
      setErrorMessage(null);
      refreshDeviceDetection();
    } catch (e: any) {
      setMicStatus('denied');
      triggerError(e.name === 'NotFoundError' ? "No physical microphone detected." : "Microphone access denied.");
    }
  };

  const authorizeScreen = async () => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
      stream.getTracks().forEach(t => t.stop());
      setScreenStatus('granted');
      setErrorMessage(null);
    } catch (e) {
      setScreenStatus('denied');
      triggerError("Screen capture denied.");
    }
  };

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
    } else {
      triggerError("Orbit Token storage failed.");
    }
    setIsAddingToken(false);
  };

  const getVerifiedLanguageName = useCallback(() => {
    const lang = availableLanguages.find(l => l.code === selectedLanguage);
    return lang ? lang.name : 'English';
  }, [availableLanguages, selectedLanguage]);

  const updateTranscriptionState = useCallback((text: string) => {
    if (!text.trim()) return;
    setCurrentTranscriptionText(text);
    setFullTranscription(prev => {
      const updated = prev ? `${prev} ${text}` : text;
      localStorage.setItem('orb_full_transcript', updated);
      return updated;
    });
  }, []);

  const animateSubtitleProgress = useCallback((duration: number) => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    
    setSubtitleProgress(0);
    setIsSubtitleVisible(true);
    
    const startTime = Date.now();
    const totalMs = duration * 1000;
    
    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / totalMs) * 100, 100);
      setSubtitleProgress(progress);
      
      if (progress >= 100) {
        clearInterval(progressIntervalRef.current!);
        setTimeout(() => {
          setIsSubtitleVisible(false);
          setSubtitleProgress(0);
        }, 500);
      }
    }, 32);
  }, []);

  const processNextInQueue = useCallback(async () => {
    if (isBusyRef.current || textQueueRef.current.length === 0 || !liveServiceRef.current) return;
    
    isBusyRef.current = true;
    const text = textQueueRef.current.shift()!;
    updateTranscriptionState(text);
    setStatus(OrbStatus.BUFFERING);
    
    const langName = getVerifiedLanguageName();

    const callbacks = {
      onTranscription: () => {},
      onAudioStarted: (duration: number) => {
        setStatus(OrbStatus.SPEAKING);
        animateSubtitleProgress(duration);
      },
      onAudioEnded: () => {},
      onTurnComplete: () => {
        setStatus(OrbStatus.IDLE);
        isBusyRef.current = false;
        setTimeout(() => processNextInQueue(), 100);
      },
      onError: (err: any) => {
        const msg = err?.message?.toLowerCase() || "";
        if (msg.includes("429") || msg.includes("quota")) rotateKeyAndReconnect();
        triggerError("Matrix Voice Error.");
        isBusyRef.current = false;
        setIsSubtitleVisible(false);
      }
    };

    liveServiceRef.current.sendText(text, langName, callbacks);
  }, [getVerifiedLanguageName, rotateKeyAndReconnect, triggerError, updateTranscriptionState, animateSubtitleProgress]);

  const connectService = useCallback(() => {
    if (!liveServiceRef.current) return;
    liveServiceRef.current.connect(selectedLanguage, selectedVoice, {
      onTranscription: () => {},
      onAudioStarted: () => setStatus(OrbStatus.SPEAKING),
      onAudioEnded: () => {},
      onTurnComplete: () => {},
      onError: (err) => triggerError("Synthesis Link Interrupted.")
    });
  }, [selectedLanguage, selectedVoice, triggerError]);

  useEffect(() => {
    if (!isMonitoring || !meetingId || settingsTab === 'speaker') {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      return;
    }

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

    return () => { if (pollingTimerRef.current) clearInterval(pollingTimerRef.current); };
  }, [isMonitoring, meetingId, processNextInQueue, settingsTab]);

  useEffect(() => {
    if (!isMonitoring || settingsTab !== 'speaker') {
      transcriptionServiceRef.current.stop();
      if (status === OrbStatus.RECORDING) setStatus(OrbStatus.IDLE);
      return;
    }

    const startRecording = async () => {
      setStatus(OrbStatus.RECORDING);
      await transcriptionServiceRef.current.start(
        transcriptionEngine,
        inputSource,
        (text) => { 
          if (text.trim()) {
            updateTranscriptionState(text);
            pushTranscription(meetingId, text); 
          }
        },
        (err) => triggerError(err.message)
      );
    };

    startRecording();
    return () => transcriptionServiceRef.current.stop();
  }, [isMonitoring, settingsTab, transcriptionEngine, inputSource, meetingId, triggerError, hasMicHardware, updateTranscriptionState]);

  useEffect(() => {
    loadOrbitKeys();
    const service = new GeminiLiveService();
    liveServiceRef.current = service;
    analyserRef.current = service.getAnalyser();
    return () => service.disconnect();
  }, [loadOrbitKeys]);

  useEffect(() => {
    if (isMonitoring && settingsTab === 'translate') connectService();
    else liveServiceRef.current?.disconnect();
  }, [isMonitoring, connectService, settingsTab]);

  const handleOrbMouseDown = (e: any) => {
    dragMouseDown(e);
    const dt = Date.now();
    const endHandler = () => {
      window.removeEventListener('mouseup', endHandler);
      window.removeEventListener('touchend', endHandler);
      if (Date.now() - dt < 200) {
        if (!meetingId && !isMonitoring) setIsSidebarOpen(true);
        else setIsMonitoring(prev => !prev);
      }
    };
    window.addEventListener('mouseup', endHandler);
    window.addEventListener('touchend', endHandler);
  };

  const clearTranscription = () => {
    setFullTranscription("");
    setCurrentTranscriptionText("");
    localStorage.removeItem('orb_full_transcript');
  };

  const embedCode = `<iframe src="${window.location.href}" width="100%" height="100%" frameborder="0" style="position:fixed; top:0; left:0; width:100%; height:100%; z-index:999999; pointer-events:none; border:none;" allow="microphone"></iframe>`;

  return (
    <div className="fixed inset-0 pointer-events-none text-white font-sans bg-transparent">
      {/* Subtitle Display - Augmented with Lifting logic for embedded mode */}
      {isMonitoring && showSubtitles && isSubtitleVisible && currentTranscriptionText && (
        <div 
          className="absolute left-1/2 -translate-x-1/2 w-fit max-w-[80vw] z-[40] animate-in fade-in slide-in-from-bottom-2 duration-300"
          style={{ bottom: isEmbedded ? 'calc(120px + 3rem)' : '3rem' }}
        >
          <div className="relative bg-black/80 backdrop-blur-2xl border border-white/20 rounded-[2rem] py-4 px-10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden">
            <div className="flex items-center gap-4">
               {/* Neural Status Indicator */}
              <div className="flex gap-1">
                <div className={`w-1 h-3 rounded-full ${status === OrbStatus.SPEAKING ? 'bg-cyan-400 animate-pulse' : 'bg-white/20'}`} />
                <div className={`w-1 h-3 rounded-full ${status === OrbStatus.SPEAKING ? 'bg-cyan-400 animate-pulse delay-75' : 'bg-white/20'}`} />
                <div className={`w-1 h-3 rounded-full ${status === OrbStatus.SPEAKING ? 'bg-cyan-400 animate-pulse delay-150' : 'bg-white/20'}`} />
              </div>
              <span className="text-[16px] font-black text-cyan-50 whitespace-nowrap overflow-hidden text-ellipsis uppercase tracking-widest italic leading-none pt-0.5">
                {currentTranscriptionText}
              </span>
            </div>
            
            {/* Dynamic Progress Fill Line */}
            <div className="absolute bottom-0 left-0 h-[3px] bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 transition-all ease-linear" style={{ width: `${subtitleProgress}%`, boxShadow: '0 0 10px rgba(34,211,238,0.8)' }} />
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-rose-600 px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest animate-bounce shadow-2xl z-[100] text-center max-w-[90%]">
          {errorMessage}
        </div>
      )}

      {isSidebarOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] p-4 pointer-events-none">
          <div className="resizable-modal bg-slate-950/98 backdrop-blur-[60px] border-2 border-white/20 transform transition-all pointer-events-auto shadow-[0_40px_100px_rgba(0,0,0,0.9)] flex flex-col rounded-[2.5rem] overflow-hidden w-[440px] h-[85vh]">
            
            <div className="shrink-0 border-b border-white/10 bg-black/40">
              <div className="flex justify-between items-center px-8 pt-8 pb-4">
                <h2 className="text-2xl font-black text-cyan-400 tracking-tighter uppercase italic drop-shadow-sm">Matrix Prime</h2>
                <button onClick={() => setIsSidebarOpen(false)} className="p-3 rounded-2xl bg-white/5 text-white/40 hover:text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="flex px-8 pb-4 gap-2">
                <button onClick={() => setSettingsTab('translate')} className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${settingsTab === 'translate' ? 'bg-cyan-500 text-black border-cyan-400' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}>Translator</button>
                <button onClick={() => setSettingsTab('speaker')} className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${settingsTab === 'speaker' ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}>Speaker</button>
                <button onClick={() => setSettingsTab('embed')} className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${settingsTab === 'embed' ? 'bg-purple-500 text-black border-purple-400' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}>Embed</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-8 p-8 custom-scrollbar">
              {settingsTab !== 'embed' && (
                <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex justify-between items-center group">
                  <div>
                    <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-1">Visual Subtitles</h4>
                    <p className="text-[8px] text-white/40 uppercase font-bold">Overlay transcription on main view</p>
                  </div>
                  <button 
                    onClick={() => {
                      const next = !showSubtitles;
                      setShowSubtitles(next);
                      localStorage.setItem('orb_show_subtitles', String(next));
                    }}
                    className={`w-12 h-6 rounded-full p-1 transition-all ${showSubtitles ? 'bg-cyan-500' : 'bg-white/10'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-all transform ${showSubtitles ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
              )}

              {settingsTab === 'translate' && (
                <>
                  <div className="bg-slate-900/60 p-6 rounded-[2rem] border border-cyan-500/20">
                    <label className="block text-[10px] font-black text-cyan-400 uppercase tracking-[0.25em] mb-4">Add Orbit Token</label>
                    <div className="flex gap-2">
                      <input type="password" value={newOrbitToken} onChange={e => setNewOrbitToken(e.target.value)} placeholder="Enter key..." className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono outline-none focus:border-cyan-500/50 transition-all" />
                      <button disabled={isAddingToken} onClick={handleAddToken} className="bg-cyan-500 text-black px-4 py-3 rounded-xl font-black text-[10px] uppercase hover:bg-cyan-400 transition-all disabled:opacity-50">{isAddingToken ? '...' : 'Inject'}</button>
                    </div>
                  </div>

                  <div className="bg-purple-900/20 p-6 rounded-[2rem] border border-purple-500/30">
                    <label className="block text-[10px] font-black text-purple-400 uppercase tracking-[0.25em] mb-4">Synthesis Verification</label>
                    <div className="space-y-3">
                      <textarea value={testText} onChange={e => setTestText(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs min-h-[120px] focus:border-purple-500/50 outline-none transition-all" />
                      <button onClick={() => { if (!isMonitoring) triggerError("System Idle."); else { textQueueRef.current.push(testText); processNextInQueue(); }}} className="w-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-lg">Trigger Voice Engine</button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Stream ID</label>
                    <input type="text" value={meetingId} onChange={e => setMeetingId(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-2xl px-5 py-4 text-sm font-mono text-cyan-100 outline-none" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Linguistics</label>
                      <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-2xl px-5 py-4 text-sm appearance-none outline-none">
                        {availableLanguages.map(l => <option key={l.code} value={l.code} className="bg-slate-900">{l.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Synthesizer</label>
                      <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-2xl px-5 py-4 text-sm appearance-none outline-none">
                        {availableVoices.map(v => <option key={v.id} value={v.id} className="bg-slate-900">{v.name}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {settingsTab === 'speaker' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="bg-emerald-900/20 p-6 rounded-[2rem] border border-emerald-500/30">
                    <div className="flex justify-between items-center mb-6">
                      <label className="block text-[10px] font-black text-emerald-400 uppercase tracking-[0.25em] flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 013 3v8a3 3 0 01-6 0V6a3 3 0 013-3z" /></svg>
                        Speaker Matrix (You Talk)
                      </label>
                      <div className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${hasMicHardware ? 'bg-emerald-500 text-black' : 'bg-rose-500 text-white animate-pulse'}`}>
                        {hasMicHardware ? 'Hardware Live' : 'No Sensors Found'}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <button onClick={authorizeMic} className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all ${micStatus === 'granted' ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.2)]' : 'bg-white/5 border-white/10 text-white/40'}`}>
                        <svg className="w-6 h-6 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 013 3v8a3 3 0 01-6 0V6a3 3 0 013-3z" /></svg>
                        <span className="text-[8px] font-black uppercase tracking-widest">{micStatus === 'granted' ? 'Microphone Authorized' : 'Grant Mic Access'}</span>
                      </button>
                      <button onClick={authorizeScreen} className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all ${screenStatus === 'granted' ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 'bg-white/5 border-white/10 text-white/40'}`}>
                        <svg className="w-6 h-6 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        <span className="text-[8px] font-black uppercase tracking-widest">{screenStatus === 'granted' ? 'System Audio Ready' : 'Grant Screen Share'}</span>
                      </button>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <div className="flex justify-between items-center mb-2 px-1">
                          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Acoustic Input</label>
                          {inputSource === 'mic' && !hasMicHardware && <span className="text-[8px] text-rose-400 font-black animate-pulse">(!) Mic Unplugged</span>}
                        </div>
                        <select value={inputSource} onChange={e => setInputSource(e.target.value as InputSource)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs outline-none focus:border-emerald-500/50">
                          <option value="mic">Vocal Input (Microphone)</option>
                          <option value="screen">Loopback Audio (Screen Share)</option>
                          <option value="internal">Digital Feed (CSPAN Loop)</option>
                        </select>
                        <p className="mt-2 text-[7px] text-white/40 uppercase tracking-widest leading-relaxed">Choose how your voice or system audio is captured to be translated by the network.</p>
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Orbital Transcription Engine</label>
                        <select value={transcriptionEngine} onChange={e => setTranscriptionEngine(e.target.value as TranscriptionEngine)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs outline-none focus:border-emerald-500/50">
                          <option value="main">Orbit Prime (Deepgram Nova-2)</option>
                          <option value="beta">Orbit Live (Gemini 2.5 Multi-Modal)</option>
                          <option value="pro">Orbit Standard (WebSpeech Native)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="bg-black/40 border border-white/5 rounded-3xl p-6">
                    <div className="flex justify-between items-center mb-4">
                      <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Neural Transcription Bank</label>
                      <button onClick={clearTranscription} className="text-[8px] font-black text-rose-400 uppercase hover:text-rose-300 transition-colors">Wipe Memory</button>
                    </div>
                    <div className="max-h-[150px] overflow-y-auto text-[10px] text-white/60 font-mono leading-relaxed bg-black/20 p-4 rounded-xl custom-scrollbar border border-white/5 italic">
                      {fullTranscription || "System memory empty. Awaiting neural feed..."}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Matrix Stream ID</label>
                    <input type="text" value={meetingId} onChange={e => setMeetingId(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-2xl px-5 py-4 text-sm font-mono text-emerald-100 outline-none" placeholder="Target UUID..." />
                    <p className="mt-2 text-[7px] text-white/40 uppercase tracking-widest text-center italic">This ID links your voice to the translation recipients.</p>
                  </div>
                </div>
              )}

              {settingsTab === 'embed' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="bg-purple-900/20 p-6 rounded-[2rem] border border-purple-500/30">
                    <label className="block text-[10px] font-black text-purple-400 uppercase tracking-[0.25em] mb-4">Embed Matrix Link</label>
                    <p className="text-[8px] text-white/60 uppercase font-bold mb-4 leading-relaxed">Inject this node into any web ecosystem. The ORB will automatically position itself in the bottom-right sector.</p>
                    
                    <textarea 
                      readOnly 
                      value={embedCode} 
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[9px] font-mono text-purple-200 min-h-[100px] mb-4 outline-none resize-none"
                    />
                    
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(embedCode);
                        setSaveFeedback(true);
                        setTimeout(() => setSaveFeedback(false), 2000);
                      }}
                      className="w-full bg-purple-600 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-purple-500 transition-all"
                    >
                      {saveFeedback ? 'Code Captured' : 'Copy Embed Node'}
                    </button>
                  </div>
                  
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 italic">
                    <p className="text-[7px] text-white/40 uppercase tracking-[0.1em] leading-loose">
                      Note: Subtitles in embedded mode are automatically lifted by 120px to prevent interface collision with bottom-bar ecosystems. Ensure the host allows 'microphone' permissions for voice features.
                    </p>
                  </div>
                </div>
              )}

              {settingsTab !== 'embed' && (
                <button 
                  onClick={() => {
                    localStorage.setItem('orb_lang', selectedLanguage);
                    localStorage.setItem('orb_voice', selectedVoice);
                    localStorage.setItem('orb_meeting_id', meetingId);
                    localStorage.setItem('orb_engine', transcriptionEngine);
                    localStorage.setItem('orb_input', inputSource);
                    setSaveFeedback(true);
                    pushTranscription(meetingId, fullTranscription);
                    setTimeout(() => setSaveFeedback(false), 2000);
                  }} 
                  className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-[0.4em] transition-all border ${saveFeedback ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-cyan-600/10 border-cyan-500/40 text-cyan-400'}`}
                >
                  {saveFeedback ? 'Matrix Synced' : 'Sync Neural Core'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-auto absolute" style={{ left: position.x, top: position.y }}>
        <Orb status={status} mode={settingsTab === 'embed' ? 'translate' : settingsTab} analyser={analyserRef.current} onMouseDown={handleOrbMouseDown} onSettingsClick={() => setIsSidebarOpen(true)} isDragging={isDragging} isPressed={false} isMonitoring={isMonitoring} />
      </div>

      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/70 backdrop-blur-md pointer-events-auto z-[55]" />}
    </div>
  );
};

export default App;
