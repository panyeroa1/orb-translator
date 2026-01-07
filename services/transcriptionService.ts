
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { TranscriptionEngine, InputSource } from '../types';

const DEEPGRAM_API_KEY = '06a7100dbcc0749000ad6bd2974e0ade118d7487';
const INTERNAL_STREAM_URL = 'https://playerservices.streamtheworld.com/api/livestream-redirect/CSPANRADIOAAC.aac';

// Manual Base64 encoding as per Gemini API guidelines
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class TranscriptionService {
  private socket: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recognition: any = null; // For WebSpeech
  private streamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private abortController: AbortController | null = null;

  // Gemini Live state
  private liveSessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;

  /**
   * Automatically detects if a microphone is available without prompting for permissions immediately.
   */
  async detectMicrophone(): Promise<boolean> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some(device => device.kind === 'audioinput');
    } catch (e) {
      return false;
    }
  }

  async start(
    engine: TranscriptionEngine,
    source: InputSource,
    onTranscript: (text: string) => void,
    onError: (err: any) => void,
    deviceId?: string
  ) {
    this.stop(); // Ensure clean slate

    // Auto-check hardware if using mic
    if (source === 'mic') {
      const hasMic = await this.detectMicrophone();
      if (!hasMic) {
        onError(new Error("No microphone hardware detected on this device."));
        return;
      }
    }

    if (engine === 'main') {
      await this.startDeepgram(source, onTranscript, onError, deviceId);
    } else if (engine === 'pro') {
      this.startWebSpeech(onTranscript, onError);
    } else if (engine === 'beta') {
      await this.startGeminiLive(source, onTranscript, onError, deviceId);
    }
  }

  private async startDeepgram(source: InputSource, onTranscript: (text: string) => void, onError: (err: any) => void, deviceId?: string) {
    const url = `wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=multi&punctuate=true`;
    
    try {
      this.socket = new WebSocket(url, ['token', DEEPGRAM_API_KEY]);
      
      this.socket.onopen = async () => {
        console.log("[ORBIT MAIN]: Deepgram Uplink Active.");
        
        try {
          let stream: MediaStream;
          
          if (source === 'mic') {
            stream = await navigator.mediaDevices.getUserMedia({ 
              audio: deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : true 
            });
          } else if (source === 'screen') {
            stream = await (navigator.mediaDevices as any).getDisplayMedia({ 
              video: true, 
              audio: { 
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              } 
            });
            if (!stream.getAudioTracks().length) {
              throw new Error("System audio share not detected. Ensure 'Share Audio' is checked in the browser dialog.");
            }
          } else {
            this.startInternalStream(onTranscript, onError);
            return;
          }

          this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
          this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0 && this.socket?.readyState === 1) {
              this.socket.send(e.data);
            }
          };
          this.mediaRecorder.start(250);

          stream.getTracks().forEach(track => {
            track.onended = () => {
              console.log("[ORBIT]: Capture session ended by user or hardware.");
              this.stop();
            };
          });

        } catch (err: any) {
          let userFriendlyError = err;
          if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            userFriendlyError = new Error("Microphone not found. Please connect a recording device.");
          } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            userFriendlyError = new Error("Hardware access denied. Please enable permissions in browser settings.");
          } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            userFriendlyError = new Error("Device is already in use by another application.");
          }
          this.stop();
          onError(userFriendlyError);
        }
      };

      this.socket.onmessage = (message) => {
        const data = JSON.parse(message.data);
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (transcript && data.is_final) {
          onTranscript(transcript);
        }
      };

      this.socket.onerror = (err) => {
        console.error("[ORBIT MAIN]: WebSocket Error:", err);
        onError(new Error("Broadcaster connection failed."));
      };

      this.socket.onclose = () => console.log("[ORBIT MAIN]: Uplink Terminated.");

    } catch (e) {
      this.stop();
      onError(e);
    }
  }

  private async startGeminiLive(source: InputSource, onTranscript: (text: string) => void, onError: (err: any) => void, deviceId?: string) {
    console.log("[ORBIT BETA]: Connecting to Gemini Live Transcriber...");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    try {
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      let stream: MediaStream;
      
      if (source === 'screen') {
        stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
        if (!stream.getAudioTracks().length) {
          throw new Error("System audio share not detected.");
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : true 
        });
      }

      this.liveSessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.log("[ORBIT BETA]: Gemini Live Link Established.");
            const sourceNode = this.inputAudioContext!.createMediaStreamSource(stream);
            const scriptProcessor = this.inputAudioContext!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };

              this.liveSessionPromise?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            sourceNode.connect(scriptProcessor);
            scriptProcessor.connect(this.inputAudioContext!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              if (text) onTranscript(text);
            }
          },
          onerror: (e: any) => {
            console.error("[ORBIT BETA]: Gemini Live Error", e);
            onError(new Error("Gemini Live Link failure."));
          },
          onclose: () => {
            console.log("[ORBIT BETA]: Gemini Live Link Closed.");
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          systemInstruction: 'You are a real-time transcription agent. Verbatim only. Stay silent.',
        }
      });

    } catch (err: any) {
      let msg = "Gemini Live initialization failed.";
      if (err.name === 'NotFoundError') msg = "Microphone not found.";
      if (err.name === 'NotAllowedError') msg = "Microphone access denied.";
      this.stop();
      onError(new Error(msg));
    }
  }

  private async startInternalStream(onTranscript: (text: string) => void, onError: (err: any) => void) {
    this.abortController = new AbortController();
    try {
      const response = await fetch(INTERNAL_STREAM_URL, { 
        redirect: 'follow',
        signal: this.abortController.signal 
      });
      if (!response.body) throw new Error("Stream empty.");
      this.streamReader = response.body.getReader();

      const pump = async () => {
        if (!this.streamReader || !this.socket || this.socket.readyState !== 1) return;
        try {
          const { done, value } = await this.streamReader.read();
          if (done) return;
          this.socket.send(value);
          pump();
        } catch (e: any) {
          if (e.name !== 'AbortError') console.error("[ORBIT]: Stream pump error", e);
        }
      };
      pump();
    } catch (e: any) {
      if (e.name !== 'AbortError') onError(new Error("Internal Matrix stream failed."));
    }
  }

  private startWebSpeech(onTranscript: (text: string) => void, onError: (err: any) => void) {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onError(new Error("WebSpeech engine unavailable."));
      return;
    }
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';
    this.recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      onTranscript(transcript);
    };
    this.recognition.onerror = (err: any) => onError(new Error(`WebSpeech: ${err.error}`));
    try { this.recognition.start(); } catch (e) { onError(e); }
  }

  stop() {
    if (this.mediaRecorder) {
      try {
        this.mediaRecorder.stop();
        this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
      } catch (e) {}
      this.mediaRecorder = null;
    }
    if (this.socket) {
      try { this.socket.close(); } catch (e) {}
      this.socket = null;
    }
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
      this.recognition = null;
    }
    if (this.liveSessionPromise) {
      this.liveSessionPromise.then(session => { try { session.close(); } catch(e) {} });
      this.liveSessionPromise = null;
    }
    if (this.inputAudioContext) {
      try { this.inputAudioContext.close(); } catch(e) {}
      this.inputAudioContext = null;
    }
    if (this.streamReader) {
      try { this.streamReader.cancel(); } catch (e) {}
      this.streamReader = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
