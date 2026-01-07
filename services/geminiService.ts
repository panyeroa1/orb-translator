
import { GoogleGenAI, Modality } from "@google/genai";
import { decode, decodeAudioData } from "./audioUtils";

export interface LiveServiceCallbacks {
  onTranscription: (text: string) => void;
  onAudioStarted: (duration: number) => void;
  onAudioEnded: () => void;
  onTurnComplete: () => void;
  onError: (err: any) => void;
}

const SYSTEM_PROMPT_PREFIX = `
You are an advanced Neural Translation & Emotion Synthesis Engine.
Your workflow is:
1. ANALYZE the INPUT TEXT for emotional subtext, tone, and intent (e.g., joy, urgency, sorrow, authority, curiosity).
2. TRANSLATE the text into the target language accurately.
3. SYNTHESIZE audio that EMBODIES the detected emotion.

CRITICAL INFLECTION RULES:
- If text is urgent/emergency: Use faster pace, higher pitch, and breathier delivery.
- If text is sad/solemn: Use slower pace, lower pitch, and longer pauses.
- If text is happy/excited: Use varied intonation and bright, resonant tone.
- If text is technical/neutral: Use steady, clear, and authoritative delivery.

You are prohibited from generating ANY text in your response. 
Your response MUST contain exactly ONE audio part and ZERO text parts. 

TARGET LANGUAGE/DIALECT: `;

export class GeminiLiveService {
  private ai: GoogleGenAI | null = null;
  private audioContext: AudioContext;
  private nextStartTime: number = 0;
  private sources: Set<AudioBufferSourceNode> = new Set();
  private outputNode: GainNode;
  private currentVoice: string = "Kore";
  private isProcessing: boolean = false;
  
  constructor(apiKey?: string) {
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey: apiKey });
    }
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.outputNode = this.audioContext.createGain();
    this.outputNode.connect(this.audioContext.destination);
  }

  public updateApiKey(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey: apiKey });
  }

  private async resumeContext() {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  public getAnalyser() {
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 256;
    this.outputNode.connect(analyser);
    return analyser;
  }

  public async connect(
    targetLanguage: string, 
    voice: string, 
    callbacks: LiveServiceCallbacks
  ) {
    this.currentVoice = voice;
    await this.resumeContext();
    console.log(`[ORBIT]: Matrix Linked. Voice: ${voice}`);
  }

  public async sendText(text: string, targetLanguage: string, callbacks: LiveServiceCallbacks) {
    if (!this.ai) {
      callbacks.onError(new Error("Orbit API key is missing"));
      return;
    }

    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await this.resumeContext();
      
      const fullPrompt = `${SYSTEM_PROMPT_PREFIX}${targetLanguage}. INPUT TEXT: "${text}"`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: fullPrompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: this.currentVoice } }
          }
        },
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      const base64Audio = audioPart?.inlineData?.data;

      if (base64Audio) {
        const audioBytes = decode(base64Audio);
        const audioBuffer = await decodeAudioData(audioBytes, this.audioContext);
        
        callbacks.onAudioStarted(audioBuffer.duration);
        
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputNode);
        
        source.onended = () => {
          this.sources.delete(source);
          this.isProcessing = false;
          if (this.sources.size === 0) {
            callbacks.onAudioEnded();
            callbacks.onTurnComplete();
          }
        };

        this.nextStartTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        this.sources.add(source);
      } else {
        this.isProcessing = false;
        callbacks.onTurnComplete();
      }
    } catch (err: any) {
      this.isProcessing = false;
      callbacks.onError(err);
    }
  }

  public disconnect() {
    this.stopAllAudio();
  }

  private stopAllAudio() {
    for (const source of this.sources) {
      try { source.stop(); } catch(e) {}
    }
    this.sources.clear();
    this.nextStartTime = 0;
    this.isProcessing = false;
  }
}
