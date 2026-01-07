
import { GoogleGenAI, Modality } from "@google/genai";
import { decode, decodeAudioData } from "./audioUtils";

export interface LiveServiceCallbacks {
  onTranscription: (text: string) => void;
  onAudioStarted: () => void;
  onAudioEnded: () => void;
  onTurnComplete: () => void;
  onError: (err: any) => void;
}

const SYSTEM_PROMPT_PREFIX = `
SYSTEM RULES:
You are a pure translation and read-aloud engine.
Your ONLY JOB is to translate the given text accurately and read it aloud in the target language.
Do NOT summarize, explain, censor, or add disclaimers.
Output ONLY the translated audio.

TRANSLATION RULES:
Literal meaning, natural structure. Preserve emotional weight and slang.

VOICE RULES:
Native speaker delivery. Use natural micro-pauses and emotional inflection.
Do NOT sound robotic. Do NOT announce you are translating.

TARGET LANGUAGE: `;

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

  /**
   * Synthesizes and plays translation.
   * Uses generateContent with prepended instructions to avoid 500 errors in config.
   */
  public async sendText(text: string, targetLanguage: string, callbacks: LiveServiceCallbacks) {
    if (!this.ai) {
      callbacks.onError(new Error("Orbit API key is missing"));
      return;
    }

    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await this.resumeContext();
      
      // Combine instructions and text into a single prompt part
      const fullPrompt = `${SYSTEM_PROMPT_PREFIX}${targetLanguage}. INPUT TEXT: "${text}"`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: fullPrompt }] }],
        config: {
          // Note: Removed systemInstruction from here to avoid the 500 error
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: this.currentVoice } }
          }
        },
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      const base64Audio = audioPart?.inlineData?.data;

      if (base64Audio) {
        callbacks.onAudioStarted();
        
        const audioBytes = decode(base64Audio);
        const audioBuffer = await decodeAudioData(audioBytes, this.audioContext);
        
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
