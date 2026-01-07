
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { OrbStatus, HistoryEntry, Language, AppMode, TranscriptionEngine, InputSource, EmotionTone } from './types';
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
import { AmbientSoundService } from './services/ambientSoundService';
import { 
  fetchNewTranscriptions, 
  pushTranscription,
  getOrbitKeys,
  addOrbitKey,
  registerUser
} from './services/supabaseService';

const App: React.FC = () => {
  // Session ID for deduplication (temporary per tab). MUST be pure UUID for DB.
  const sessionClientId = useMemo(() => crypto.randomUUID(), []);
  
  // Persistent Anonymous User ID (Syncs with DB users table)
  const anonymousUserId = useMemo(() => {
    let id = localStorage.getItem('orb_anonymous_user_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('orb_anonymous_user_id', id);
    }
    return id;
  }, []);

  const isEmbedded = useMemo(() => { try { return window.self !== window.top; } catch (e) { return true; } }, []);

  const [status, setStatus] = useState<OrbStatus>(OrbStatus.IDLE);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<AppMode | 'embed'>('translate');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentTranscriptionText, setCurrentTranscriptionText] = useState<string>("");
  const [fullTranscription, setFullTranscription] = useState<string>(() => localStorage.getItem('orb_full_transcript') || "");
  const [showSubtitles, setShowSubtitles] = useState<boolean>(() => localStorage.getItem('orb_show_subtitles') !== 'false');
  const [currentEmotion, setCurrentEmotion] = useState<EmotionTone>('NEUTRAL');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [isJoiningProtocol, setIsJoiningProtocol] = useState(false);
  
  const [subtitleProgress, setSubtitleProgress] = useState(0);
  const [isSubtitleVisible, setIsSubtitleVisible] = useState(false);
  const [subtitleOpacity, setSubtitleOpacity] = useState(false);

  const [transcriptionEngine, setTranscriptionEngine] = useState<TranscriptionEngine>(() => (localStorage.getItem('orb_engine') as TranscriptionEngine) || 'main');
  const [inputSource, setInputSource] = useState<InputSource>(() => (localStorage.getItem('orb_input') as InputSource) || 'mic');
  const [micStatus, setMicStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [screenStatus, setScreenStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState(() => localStorage.getItem('orb_mic_id') || 'default');

  const [orbitKeys, setOrbitKeys] = useState<string[]>([]);
  const [newOrbitToken, setNewOrbitToken] = useState('');
  
  const [availableLanguages] = useState<Language[]>(FALLBACK_LANGUAGES);
  const [availableVoices] = useState<{id: string, name: string}[]>(FALLBACK_VOICES);
  const [selectedLanguage, setSelectedLanguage] = useState(() => localStorage.getItem('orb_lang') || 'en-tl');
  const [selectedVoice, setSelectedVoice] = useState(() => localStorage.getItem('orb_voice') || 'Zephyr');
  
  // MEETING ID HANDLING (Query Param Support)
  const [meetingId, setMeetingId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('meeting');
    return fromUrl || localStorage.getItem('orb_meeting_id') || crypto.randomUUID();
  });

  const textQueueRef = useRef<string[]>([]);
  const isBusyRef = useRef<boolean>(false);
  const lastFetchedAtRef = useRef<string>(new Date(Date.now() - 30000).toISOString());
  const processedIdCacheRef = useRef<Set<string>>(new Set());
  
  const liveServiceRef = useRef<GeminiLiveService | null>(null);
  const transcriptionServiceRef = useRef<TranscriptionService>(new TranscriptionService());
  const ambientSoundRef = useRef<AmbientSoundService>(new AmbientSoundService());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pollingTimerRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  
  const { position, isDragging, handleMouseDown: dragMouseDown } = useDraggable(120, 120);

  const triggerError = useCallback((msg: string) => {
    setErrorMessage(msg);
    setStatus(OrbStatus.ERROR);
    setIsMonitoring(false);
    setTimeout(() => { setErrorMessage(null); setStatus(OrbStatus.IDLE); }, 5000);
  }, []);

  // PERSISTENCE SYNC
  useEffect(() => { localStorage.setItem('orb_engine', transcriptionEngine); }, [transcriptionEngine]);
  useEffect(() => { localStorage.setItem('orb_input', inputSource); }, [inputSource]);
  useEffect(() => { localStorage.setItem('orb_mic_id', selectedMicrophoneId); }, [selectedMicrophoneId]);
  useEffect(() => { localStorage.setItem('orb_lang', selectedLanguage); }, [selectedLanguage]);
  useEffect(() => { localStorage.setItem('orb_voice', selectedVoice); }, [selectedVoice]);
  useEffect(() => { localStorage.setItem('orb_show_subtitles', showSubtitles.toString()); }, [showSubtitles]);

  // Check for invite protocol on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('meeting')) {
      setIsJoiningProtocol(true);
      setTimeout(() => setIsJoiningProtocol(false), 4000);
      setSettingsTab('translate'); // Usually guests want translation
    }
  }, []);

  // Sync anonymous user with DB on mount
  useEffect(() => {
    registerUser(anonymousUserId).then(success => {
      console.log(`[ORBIT]: Matrix Link ${success ? 'Secured' : 'Syncing...'}`);
    });
  }, [anonymousUserId]);

  useEffect(() => {
    if (meetingId) localStorage.setItem('orb_meeting_id', meetingId);
  }, [meetingId]);

  useEffect(() => { ambientSoundRef.current.setStatus(status, isMonitoring); }, [status, isMonitoring]);

  const authorizeMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicStatus('granted');
    } catch (e) { setMicStatus('denied'); triggerError("Mic Access Denied."); }
  };

  const authorizeScreen = async () => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
      stream.getTracks().forEach(t => t.stop());
      setScreenStatus('granted');
    } catch (e) { setScreenStatus('denied'); triggerError("Screen Access Denied."); }
  };

  const copyInviteLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('meeting', meetingId);
    navigator.clipboard.writeText(url.toString());
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const getVerifiedLanguageName = useCallback(() => {
    const lang = availableLanguages.find(l => l.code === selectedLanguage);
    return lang ? lang.name : 'English';
  }, [availableLanguages, selectedLanguage]);

  const updateTranscriptionState = useCallback((text: string) => {
    if (!text.trim()) return "";
    setCurrentTranscriptionText(text);
    let updated = "";
    setFullTranscription(prev => {
      updated = prev ? `${prev} ${text}` : text;
      localStorage.setItem('orb_full_transcript', updated);
      return updated;
    });
    return updated;
  }, []);

  const animateSubtitleProgress = useCallback((duration: number) => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setSubtitleProgress(0); setIsSubtitleVisible(true); setSubtitleOpacity(true);
    const startTime = Date.now();
    const totalMs = duration * 1000;
    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / totalMs) * 100, 100);
      setSubtitleProgress(progress);
      if (progress >= 100) {
        clearInterval(progressIntervalRef.current!);
        setTimeout(() => { setSubtitleOpacity(false); setTimeout(() => setIsSubtitleVisible(false), 1000); }, 500);
      }
    }, 32);
  }, []);

  const processNextInQueue = useCallback(async () => {
    if (isBusyRef.current || textQueueRef.current.length === 0 || !liveServiceRef.current) return;
    const text = textQueueRef.current.shift()!;
    if (!text.trim()) return;

    isBusyRef.current = true;
    updateTranscriptionState(text);
    setStatus(OrbStatus.BUFFERING);
    
    liveServiceRef.current.sendText(text, getVerifiedLanguageName(), {
      onTranscription: () => {},
      onAudioStarted: (duration) => { setStatus(OrbStatus.SPEAKING); animateSubtitleProgress(duration); },
      onAudioEnded: () => setCurrentEmotion('NEUTRAL'),
      onTurnComplete: () => { setStatus(OrbStatus.IDLE); isBusyRef.current = false; setTimeout(() => processNextInQueue(), 100); },
      onEmotionDetected: (emotion) => setCurrentEmotion(emotion),
      onError: () => { isBusyRef.current = false; setStatus(OrbStatus.IDLE); }
    });
  }, [getVerifiedLanguageName, updateTranscriptionState, animateSubtitleProgress]);

  // DATA BINDING: TRANSLATOR (RECEIVER)
  useEffect(() => {
    if (!isMonitoring || settingsTab === 'speaker') {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      return;
    }

    lastFetchedAtRef.current = new Date(Date.now() - 5000).toISOString();
    processedIdCacheRef.current.clear();

    const poll = async () => {
      // excludeSpeakerId uses sessionClientId (Pure UUID)
      const records = await fetchNewTranscriptions(meetingId, lastFetchedAtRef.current, sessionClientId);
      if (records && records.length > 0) {
        records.forEach(rec => {
          if (!processedIdCacheRef.current.has(rec.id)) {
            processedIdCacheRef.current.add(rec.id);
            textQueueRef.current.push(rec.transcribe_text_segment);
          }
        });
        lastFetchedAtRef.current = records[records.length - 1].created_at;
        processNextInQueue();
      }
    };

    poll();
    pollingTimerRef.current = window.setInterval(poll, POLLING_INTERVAL_MIN);
    return () => { if (pollingTimerRef.current) clearInterval(pollingTimerRef.current); };
  }, [isMonitoring, meetingId, processNextInQueue, settingsTab, sessionClientId]);

  // DATA BINDING: SPEAKER (BROADCASTER)
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
            const newHistory = updateTranscriptionState(text);
            // pushTranscription uses sessionClientId (Pure UUID)
            pushTranscription(meetingId, text, sessionClientId, newHistory, anonymousUserId, ["host", "guest1"]); 
          }
        },
        (err) => triggerError(err.message),
        selectedMicrophoneId
      );
    };

    startRecording();
    return () => transcriptionServiceRef.current.stop();
  }, [isMonitoring, settingsTab, transcriptionEngine, inputSource, meetingId, triggerError, selectedMicrophoneId, sessionClientId, anonymousUserId]);

  useEffect(() => {
    const service = new GeminiLiveService();
    liveServiceRef.current = service;
    analyserRef.current = service.getAnalyser();
    getOrbitKeys().then(keys => { setOrbitKeys(keys); if (keys.length > 0) service.updateApiKey(keys[0]); });
    return () => service.disconnect();
  }, []);

  useEffect(() => {
    if (isMonitoring && settingsTab === 'translate') {
      liveServiceRef.current?.connect(selectedLanguage, selectedVoice, {
        onTranscription: () => {},
        onAudioStarted: () => setStatus(OrbStatus.SPEAKING),
        onAudioEnded: () => setCurrentEmotion('NEUTRAL'),
        onTurnComplete: () => {},
        onError: () => triggerError("Link Failure.")
      });
    } else { liveServiceRef.current?.disconnect(); }
  }, [isMonitoring, selectedLanguage, selectedVoice, settingsTab, triggerError]);

  const handleOrbMouseDown = (e: any) => {
    dragMouseDown(e);
    const dt = Date.now();
    const endHandler = () => {
      window.removeEventListener('mouseup', endHandler);
      if (Date.now() - dt < 200) {
        if (!meetingId && !isMonitoring) setIsSidebarOpen(true);
        else setIsMonitoring(prev => !prev);
      }
    };
    window.addEventListener('mouseup', endHandler);
  };

  return (
    <div className="fixed inset-0 pointer-events-none text-white font-sans bg-transparent">
      {/* JOINING PROTOCOL OVERLAY */}
      {isJoiningProtocol && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-xl animate-in fade-in duration-700">
          <div className="text-center">
            <div className="w-24 h-24 mb-6 mx-auto relative">
              <div className="absolute inset-0 rounded-full border-4 border-cyan-500/20 border-t-cyan-500 animate-spin" />
              <div className="absolute inset-4 rounded-full border-4 border-cyan-500/10 border-b-cyan-500 animate-[spin_1.5s_linear_infinite_reverse]" />
            </div>
            <h3 className="text-3xl font-black text-cyan-400 uppercase tracking-[0.3em] italic mb-2">Syncing Matrix</h3>
            <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Acoustic Channel: {meetingId.slice(0, 8)}...</p>
          </div>
        </div>
      )}

      {isMonitoring && showSubtitles && isSubtitleVisible && currentTranscriptionText && (
        <div className={`absolute left-1/2 -translate-x-1/2 w-fit max-w-[80vw] z-[40] transition-opacity duration-1000 ${subtitleOpacity ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`} style={{ bottom: isEmbedded ? 'calc(120px + 3rem)' : '3rem' }}>
          <div className="relative bg-black/80 backdrop-blur-2xl border border-white/20 rounded-[2rem] py-4 px-10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden">
            <div className="flex items-center gap-4">
              <div className="flex gap-1">
                <div className={`w-1 h-3 rounded-full ${status === OrbStatus.SPEAKING ? 'bg-cyan-400 animate-pulse' : 'bg-white/20'}`} />
                <div className={`w-1 h-3 rounded-full ${status === OrbStatus.SPEAKING ? 'bg-cyan-400 animate-pulse delay-75' : 'bg-white/20'}`} />
                <div className={`w-1 h-3 rounded-full ${status === OrbStatus.SPEAKING ? 'bg-cyan-400 animate-pulse delay-150' : 'bg-white/20'}`} />
              </div>
              <span className="text-[16px] font-black text-cyan-50 whitespace-nowrap overflow-hidden text-ellipsis uppercase tracking-widest italic leading-none pt-0.5">{currentTranscriptionText}</span>
            </div>
            <div className="absolute bottom-0 left-0 h-[3px] bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 transition-all ease-linear" style={{ width: `${subtitleProgress}%`, boxShadow: '0 0 10px rgba(34,211,238,0.8)' }} />
          </div>
        </div>
      )}

      {errorMessage && <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-rose-600 px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest animate-bounce shadow-2xl z-[100] text-center max-w-[90%]">{errorMessage}</div>}

      {isSidebarOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] p-4 pointer-events-none">
          <div className="resizable-modal bg-slate-950/98 backdrop-blur-[60px] border-2 border-white/20 transform transition-all pointer-events-auto shadow-[0_40px_100px_rgba(0,0,0,0.9)] flex flex-col rounded-[2.5rem] overflow-hidden w-[440px] h-[85vh]">
            <div className="shrink-0 border-b border-white/10 bg-black/40">
              <div className="flex justify-between items-center px-8 pt-8 pb-4">
                <h2 className="text-2xl font-black text-cyan-400 tracking-tighter uppercase italic drop-shadow-sm">Matrix Prime</h2>
                <button onClick={() => setIsSidebarOpen(false)} className="p-3 rounded-2xl bg-white/5 text-white/40 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="flex px-8 pb-4 gap-2">
                <button onClick={() => setSettingsTab('translate')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${settingsTab === 'translate' ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}>Translator Mode</button>
                <button onClick={() => setSettingsTab('speaker')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${settingsTab === 'speaker' ? 'bg-emerald-500 text-black border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)]' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}>Speaker Mode</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-8 p-8 custom-scrollbar">
              <div className="bg-slate-900/40 p-5 rounded-3xl border border-white/10">
                <div className="flex justify-between items-center mb-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acoustic Channel</label>
                  <button onClick={copyInviteLink} className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase transition-all ${copyFeedback ? 'bg-emerald-500 text-black' : 'bg-white/10 text-cyan-400 hover:bg-white/20'}`}>
                    {copyFeedback ? 'Copied' : 'Share Link'}
                  </button>
                </div>
                <div className="relative">
                  <input type="text" value={meetingId} onChange={e => setMeetingId(e.target.value)} className="w-full bg-black/40 border border-white/20 rounded-2xl px-5 py-4 text-sm font-mono text-cyan-100 outline-none focus:border-cyan-500/50" />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/10 uppercase select-none">Global ID</div>
                </div>
              </div>

              {settingsTab === 'translate' && (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-8">
                  <div className="bg-slate-900/60 p-6 rounded-[2rem] border border-cyan-500/20">
                    <label className="block text-[10px] font-black text-cyan-400 uppercase tracking-[0.25em] mb-4">Injection Token</label>
                    <div className="flex gap-2">
                      <input type="password" value={newOrbitToken} onChange={e => setNewOrbitToken(e.target.value)} placeholder="API Key..." className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono outline-none" />
                      <button onClick={() => { if(!newOrbitToken)return; addOrbitKey(newOrbitToken).then(() => {setNewOrbitToken(''); getOrbitKeys().then(setOrbitKeys);}); }} className="bg-cyan-500 text-black px-4 py-3 rounded-xl font-black text-[10px] uppercase hover:bg-cyan-400 transition-all">Inject</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Linguistics</label>
                      <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-2xl px-5 py-4 text-sm appearance-none outline-none">{availableLanguages.map(l => <option key={l.code} value={l.code} className="bg-slate-900">{l.name}</option>)}</select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Synthesizer</label>
                      <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-2xl px-5 py-4 text-sm appearance-none outline-none">{availableVoices.map(v => <option key={v.id} value={v.id} className="bg-slate-900">{v.name}</option>)}</select>
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === 'speaker' && (
                <div className="animate-in fade-in slide-in-from-left-4 duration-300 space-y-8">
                  <div className="bg-emerald-900/10 p-6 rounded-[2.5rem] border border-emerald-500/20">
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <button onClick={authorizeMic} className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all ${micStatus === 'granted' ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.1)]' : 'bg-white/5 border-white/10 text-white/40'}`}>
                        <svg className="w-6 h-6 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 013 3v8a3 3 0 01-6 0V6a3 3 0 013-3z" /></svg>
                        <span className="text-[8px] font-black uppercase">Mic Grant</span>
                      </button>
                      <button onClick={authorizeScreen} className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all ${screenStatus === 'granted' ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'bg-white/5 border-white/10 text-white/40'}`}>
                        <svg className="w-6 h-6 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        <span className="text-[8px] font-black uppercase">Screen Share</span>
                      </button>
                    </div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Transmission Engine</label>
                    <select value={transcriptionEngine} onChange={e => setTranscriptionEngine(e.target.value as TranscriptionEngine)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs outline-none focus:border-emerald-500/50">
                      <option value="main">Deepgram Nova-2 (Speed)</option>
                      <option value="beta">Gemini Live (Intelligence)</option>
                      <option value="pro">WebSpeech (Standard)</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="bg-black/40 border border-white/5 rounded-3xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Neural Memory</label>
                  <button onClick={() => setFullTranscription("")} className="text-[8px] font-black text-rose-400 uppercase hover:text-rose-300 transition-colors">Clear</button>
                </div>
                <div className="max-h-[150px] overflow-y-auto text-[11px] text-white/50 font-mono italic p-4 bg-black/20 rounded-xl border border-white/5 custom-scrollbar">
                  {fullTranscription || "Awaiting neural sync..."}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-auto absolute" style={{ left: position.x, top: position.y }}>
        <Orb 
          status={status} 
          mode={settingsTab === 'embed' ? 'translate' : settingsTab} 
          analyser={analyserRef.current} 
          onMouseDown={handleOrbMouseDown} 
          onSettingsClick={() => setIsSidebarOpen(true)} 
          isDragging={isDragging} 
          isPressed={false} 
          isMonitoring={isMonitoring} 
          emotion={currentEmotion}
        />
      </div>

      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/70 backdrop-blur-md pointer-events-auto z-[55]" />}
    </div>
  );
};

export default App;
