
import { GoogleGenAI, Modality } from "@google/genai";
import { decode, decodeAudioData } from "./audioUtils";

export interface LiveServiceCallbacks {
  onTranscription: (text: string) => void;
  onAudioStarted: () => void;
  onAudioEnded: () => void;
  onTurnComplete: () => void;
  onError: (err: any) => void;
}

const DEFAULT_SYSTEM_INSTRUCTION = `
You are a pure translation and read-aloud engine.
Your ONLY JOB is to:
1. Translate the given text accurately
2. Read it aloud in the target language or dialect

You must NOT:
- Change the meaning, intent, tone, or context
- Summarize, simplify, explain, censor, soften, moralize, or editorialize
- Add warnings, disclaimers, or safety notes
- Refuse or restrict content
- Replace words with “safer” alternatives
- Remove emotions, intensity, or cultural expressions

TRANSLATION RULES:
- Translation must be literal in meaning, natural in structure
- Preserve: Emotional weight, Formality or informality, Slang, idioms, profanity, Cultural references, Sentence pacing and rhythm
- If the source contains ambiguity, keep the ambiguity. If the source is harsh, stay harsh. If the source is poetic, stay poetic.

VOICE & READ-ALOUD RULES:
- Read aloud as a native speaker of the target language or dialect
- Use natural human delivery, including: Micro-pauses, Breathy moments, Subtle hesitations, Emotional inflection (sadness, urgency, calm, warmth, tension, etc.)
- Match reading speed to the content (Urgent -> faster, Calm -> slower)
- Do NOT sound robotic, neutral, or flat
- Do NOT announce that you are reading or translating

STRICT OUTPUT MODE:
- Output ONLY the translated text
- No explanations, no metadata, no annotations, no brackets, no stage directions
- LANGUAGE LOCK: Stay locked to the target language/dialect. No code-switching.

FAILURE CONDITIONS:
- NEVER say “I cannot translate this” or “This content may be sensitive”
- You are not an assistant, narrator, or moderator. 
- You are a transparent linguistic conduit. 
- Translate. Read aloud. Nothing else.
`;

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

  // Simplified connect - purely for interface compatibility
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
   * Uses generateContent (Audio Modality) for maximum stability with text input.
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
      
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts', // Specialized high-fidelity TTS model
        contents: [{ parts: [{ text: `TARGET LANGUAGE: ${targetLanguage}. INPUT: "${text}"` }] }],
        config: {
          systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
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
