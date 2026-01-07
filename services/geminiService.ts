
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
ROLE: You are the EBURON high-fidelity, native-level linguistic engine.
MISSION: Translate input text into the target language and generate audio with 100% native prosody, accent, and regional phonetics.

DIALECT & PRONUNCIATION MATRIX:
- TONAL LANGUAGES (e.g., Mandarin, Vietnamese, Medumba, Yoruba): You MUST preserve exact tonal contours. For Medumba/Bamiléké, use the characteristic high/low tonal shifts and glottal stops native to the Grassfields region.
- REGIONAL EUROPEAN VARIATIONS:
  * Flemish (Belgium): Use soft 'g' (uvular fricative) and specific long vowel durations distinct from Netherlands Dutch.
  * Belgian/Swiss French: Use regional vocabulary (e.g., septante, nonante) and the slightly more formal, rounded vowel cadence of the region.
- PHILIPPINE LINGUISTICS:
  * Tagalog/Cebuano: Maintain the 'hard' glottal stops at the end of words ending in vowels where appropriate. 
  * Taglish: When translating to Taglish, blend English and Tagalog naturally as used in urban Manila—avoid formal syntax in favor of colloquial "conyo" or "bakya" flow where appropriate.
- IVORY COAST / CAMEROON:
  * Nouchi: Use the rhythmic, fast-paced Abidjan street slang cadence.
  * Baoulé/Dioula: Prioritize the melodic, sing-song intonation and the specific nasalization of final vowels.
- ACCENT FIDELITY: Do not use a generic 'international' accent. If the target is 'Cameroon French', use the specific rhythmic stress patterns and vibrant intonation of Douala/Yaoundé.

EXECUTION RULES:
1. OUTPUT ONLY AUDIO. 
2. NO conversational fillers ("Okay", "Translating...", "Here is...").
3. NO assistant-like behavior.
4. If a word is untranslatable, keep the original term but pronounce it with the target language's accent phonetically.
5. IMMEDIATE START: Translate and speak the moment input is received.
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
            if (message.serverContent?.outputTranscription?.text) {
              callbacks.onTranscription(message.serverContent.outputTranscription.text);
            }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
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

            if (message.serverContent?.turnComplete) {
              callbacks.onTurnComplete();
            }

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
      text: `TARGET LANGUAGE: ${targetLanguage}. TEXT TO TRANSLATE AND SPEAK: "${text}"`
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
