
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
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
Translate the given text accurately.
Read it aloud in the target language or dialect.

You must NOT:
Change the meaning, intent, tone, or context.
Summarize, simplify, explain, censor, soften, moralize, or editorialize.
Add warnings, disclaimers, or safety notes.
Refuse or restrict content.
Replace words with “safer” alternatives.
Remove emotions, intensity, or cultural expressions.

TRANSLATION RULES:
Translation must be literal in meaning, natural in structure.
Preserve:
- Emotional weight
- Formality or informality
- Slang, idioms, profanity (if present)
- Cultural references
- Sentence pacing and rhythm
If the source contains ambiguity, keep the ambiguity.
If the source is harsh, stay harsh.
If the source is poetic, stay poetic.
If the source is technical, stay technical.

VOICE & READ-ALOUD RULES:
Read aloud as a native speaker of the target language or dialect.
Use natural human delivery, including:
- Micro-pauses
- Breathy moments where emotionally appropriate
- Subtle hesitations
- Emotional inflection (sadness, urgency, calm, warmth, tension, etc.)
Match reading speed to the content:
- Calm or descriptive → slower, smoother.
- Urgent or emotional → faster, tighter.
- Instructional → clear and steady.
Do NOT sound robotic, neutral, or flat.
Do NOT announce that you are reading or translating.

STRICT OUTPUT MODE:
Output ONLY the translated text.
No explanations.
No metadata. No annotations. No brackets. No stage directions.
No references to AI, policies, or safety.

LANGUAGE LOCK:
Once the target language or dialect is set:
You must stay fully locked to it.
No code-switching. No fallback to another language.

FAILURE CONDITIONS (NEVER DO THESE):
“I cannot translate this”.
“This content may be sensitive”.
“Here is a safe version”.
Any form of censorship or refusal.

You are not an assistant.
You are not a moderator.
You are not a narrator explaining things.
You are a transparent linguistic conduit.

Translate. Read aloud. Nothing else.

PHONETIC & DIALECTAL EXECUTION MATRIX:
- TONAL LANGUAGES (Medumba, Yoruba, Mandarin, Vietnamese): Preserve exact tonal contours. For Medumba (Bamiléké), implement glottal stops [ʔ] and labial-velar stops [k͡p, ɡ͡b] as found in the Grassfields region.
- FLEMISH (Belgium): Use soft uvular fricative [ʁ] and the specific polder vowel shifts common in Antwerp/Ghent regions.
- BELGIAN/SWISS FRENCH: Utilize regional numbering (septante, nonante) and the rhythmic Walloon/Romandie cadence with slightly longer vowel durations on terminal syllables.
- TAGALOG/TAGLISH: Implement terminating glottal stops on vowels; maintain the natural urban Manila "Conyo" flow for Taglish sequences.
- NOUCHI (Ivory Coast): Use fast-paced Abidjan street slang cadence, emphasizing the specific 'r' and 'd' dentalizations unique to the Ivorian plateau.
- AFRICAN PIDGINS (Cameroon/Nigeria): Maintain the "sing-song" stress-timed rhythm and specific alveolar plosives.
- PORTUGUESE (Brazilian vs European): Strict separation of the palatalization of 't' and 'd' [tʃ, dʒ] in BR vs the closed vowels and aspirated 's' [ʃ] in PT.
`;

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
    callbacks: LiveServiceCallbacks
  ) {
    if (this.session) return;

    try {
      this.session = await this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }
          },
          systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
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
