
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { decode, decodeAudioData } from "./audioUtils";

export interface LiveServiceCallbacks {
  onTranscription: (text: string) => void;
  onAudioStarted: () => void;
  onAudioEnded: () => void;
  onTurnComplete: () => void;
  onError: (err: any) => void;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private session: any = null;
  private audioContext: AudioContext;
  private nextStartTime: number = 0;
  private sources: Set<AudioBufferSourceNode> = new Set();
  private outputNode: GainNode;
  
  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.outputNode = this.audioContext.createGain();
    this.outputNode.connect(this.audioContext.destination);
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
    systemPrompt: string,
    callbacks: LiveServiceCallbacks
  ) {
    if (this.session) return;

    const fullInstruction = `
${systemPrompt}
You are a high-fidelity, native-level translation and speech system.
Your goal is to translate the input text and read it aloud with perfect native pronunciation, including regional dialects and accents.
Output ONLY the audio. Do not add conversational fillers, greetings, or explanations.
Act as a purely systemic translator.

Reference Pronunciation Guide:
- African Dialects (e.g., Medumba, Baoulé, Dioula): Use authentic local intonation, tonal shifts, and phonetic rhythms. Avoid westernized stress.
- Philippine Dialects (e.g., Tagalog, Cebuano, Bisaya, Taglish): Maintain native stress patterns, glottal stops, and melodic lilts.
- European Languages (e.g., Flemish, Swiss French): Use specific regional vowel lengths and consonants (e.g., soft 'g' for Flemish).
- Standard Languages: Use high-clarity, professional native accents.

DO NOT ASK QUESTIONS. DO NOT RESPOND AS AN ASSISTANT. TRANSLATE AND SPEAK IMMEDIATELY.
`;

    try {
      this.session = await this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }
          },
          systemInstruction: fullInstruction,
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => console.log("[LIVE]: Connected"),
          onmessage: async (message: LiveServerMessage) => {
            // 1. Handle Transcriptions (The translation text)
            if (message.serverContent?.outputTranscription?.text) {
              callbacks.onTranscription(message.serverContent.outputTranscription.text);
            }

            // 2. Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            // Fix TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
            if (base64Audio && typeof base64Audio === 'string') {
              callbacks.onAudioStarted();
              this.nextStartTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
              
              const audioBytes = decode(base64Audio);
              const audioBuffer = await decodeAudioData(audioBytes, this.audioContext);
              
              const source = this.audioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              
              source.onended = () => {
                this.sources.delete(source);
                if (this.sources.size === 0) {
                  callbacks.onAudioEnded();
                }
              };

              source.start(this.nextStartTime);
              this.nextStartTime += audioBuffer.duration;
              this.sources.add(source);
            }

            // 3. Handle Turn Complete
            if (message.serverContent?.turnComplete) {
              callbacks.onTurnComplete();
            }

            // 4. Handle Interruption (shouldn't happen in 1-way, but for safety)
            if (message.serverContent?.interrupted) {
              this.stopAllAudio();
            }
          },
          onerror: (e) => {
            console.error("[LIVE ERROR]:", e);
            callbacks.onError(e);
          },
          onclose: () => {
            console.log("[LIVE]: Closed");
            this.session = null;
          }
        }
      });
    } catch (err) {
      callbacks.onError(err);
      throw err;
    }
  }

  public sendText(text: string, targetLanguage: string) {
    if (!this.session) return;
    this.session.sendRealtimeInput({
      text: `Translate to ${targetLanguage} and speak: "${text}"`
    });
  }

  public disconnect() {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
    this.stopAllAudio();
  }

  private stopAllAudio() {
    for (const source of this.sources) {
      try { source.stop(); } catch(e) {}
    }
    this.sources.clear();
    this.nextStartTime = 0;
  }
}
