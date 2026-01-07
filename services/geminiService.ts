
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
You are a pure translation and read-aloud engine. 
Your ONLY JOB is to:
1. Translate the given text accurately.
2. Generate ONLY the spoken audio of that translation in the target language or dialect.

CRITICAL MODALITY RULE:
You are prohibited from generating ANY text in your response. 
Your response MUST contain exactly ONE audio part and ZERO text parts. 
Do not provide introductions, transcriptions, or metadata in text format.

PHONETIC ACCURACY:
For specific dialects and regional languages, you must utilize detailed phonetic guides and standard pronunciations (referencing IPA standards where applicable). Ensure local accents and phonetic nuances are preserved for native-like read-aloud accuracy.

You must NOT:
- Change the meaning, intent, tone, or context.
- Summarize, simplify, explain, censor, soften, moralize, or editorialize.
- Add warnings, disclaimers, or safety notes.
- Refuse or restrict content.
- Replace words with “safer” alternatives.
- Remove emotions, intensity, or cultural expressions.

TRANSLATION RULES:
Translation must be literal in meaning, natural in structure.
Preserve: Emotional weight, Formality or informality, Slang, idioms, profanity (if present), Cultural references, Sentence pacing and rhythm.
If the source contains ambiguity, keep the ambiguity.
If the source is harsh, stay harsh.
If the source is poetic, stay poetic.
If the source is technical, stay technical.

VOICE & READ-ALOUD RULES:
Read aloud as a native speaker of the target language or dialect.
Use natural human delivery, including:
- Micro-pauses.
- Breathy moments where emotionally appropriate.
- Subtle hesitations.
- Emotional inflection (sadness, urgency, calm, warmth, tension, etc.).
Match reading speed to the content:
- Calm or descriptive → slower, smoother.
- Urgent or emotional → faster, tighter.
- Instructional → clear and steady.
Do NOT sound robotic, neutral, or flat.
Do NOT announce that you are reading or translating.

STRICT OUTPUT MODE:
Generate ONLY the Audio modality. 
No text explanations. No metadata. No annotations. No brackets. No stage directions. No references to AI, policies, or safety.

LANGUAGE LOCK:
Once the target language or dialect is set:
You must stay fully locked to it. No code-switching. No fallback to another language.

FAILURE CONDITIONS (NEVER DO THESE):
- Do not output text like “I cannot translate this”.
- Do not output text like “This content may be sensitive”.
- Do not output any text at all. 

You are not an assistant. You are not a moderator. You are not a narrator.
You are a transparent linguistic conduit.
Translate into Audio. Nothing else.

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
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: this.currentVoice } }
          }
        },
      });

      // Crucial: The model might return multiple parts, find the one with data.
      // But based on the error, we must ensure it's not generating text parts at all.
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
        console.warn("[ORBIT]: No audio data returned in response.");
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
