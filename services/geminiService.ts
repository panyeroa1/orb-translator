
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { decode, decodeAudioData } from "./audioUtils";
import { EmotionTone } from "../types";

export interface LiveServiceCallbacks {
  onTranscription: (text: string) => void;
  onAudioStarted: (duration: number) => void;
  onAudioEnded: () => void;
  onTurnComplete: () => void;
  onError: (err: any) => void;
  onEmotionDetected?: (emotion: EmotionTone) => void;
}

const SYSTEM_PROMPT_PREFIX = `
You are an advanced Neural Translation & Emotion Synthesis Engine.
Your workflow is:
1. TRANSLATE the input text to the target language accurately, maintaining nuance and tone.
2. ANALYZE the original text for emotional subtext.
3. SYNTHESIZE audio of the TRANSLATED text only.

RULES:
- You MUST only speak the TRANSLATED version of the provided text.
- Do NOT repeat the input text.
- ZERO text output is permitted. Only audio.

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
    const finalKey = apiKey || process.env.API_KEY;
    if (finalKey) {
      this.ai = new GoogleGenAI({ apiKey: finalKey });
    }
    
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.outputNode = this.audioContext.createGain();
    this.outputNode.connect(this.audioContext.destination);
  }

  public updateApiKey(apiKey: string) {
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey: apiKey });
    }
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

  public async connect(targetLanguage: string, voice: string, callbacks: LiveServiceCallbacks) {
    this.currentVoice = voice;
    await this.resumeContext();
    console.log(`[ORBIT]: Synthesis Engine Online. Target: ${targetLanguage}`);
  }

  public async analyzeEmotion(text: string): Promise<EmotionTone> {
    if (!this.ai) return 'NEUTRAL';
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze the following text and return its primary emotional tone from this list: NEUTRAL, HAPPY, SAD, ANGRY, URGENT, CALM, INTENSE, CURIOUS. Return ONLY the word. Text: "${text}"`,
        config: {
          responseMimeType: "text/plain",
          temperature: 0.1,
        }
      });
      const emotion = response.text?.trim().toUpperCase() as EmotionTone;
      return ['NEUTRAL', 'HAPPY', 'SAD', 'ANGRY', 'URGENT', 'CALM', 'INTENSE', 'CURIOUS'].includes(emotion) ? emotion : 'NEUTRAL';
    } catch (e) {
      return 'NEUTRAL';
    }
  }

  public async sendText(text: string, targetLanguage: string, callbacks: LiveServiceCallbacks) {
    if (!this.ai) {
      callbacks.onError(new Error("API Key Missing"));
      return;
    }

    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await this.resumeContext();

      this.analyzeEmotion(text).then(emotion => {
        if (callbacks.onEmotionDetected) callbacks.onEmotionDetected(emotion);
      });
      
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
    for (const source of this.sources) {
      try { source.stop(); } catch(e) {}
    }
    this.sources.clear();
    this.nextStartTime = 0;
    this.isProcessing = false;
  }
}
