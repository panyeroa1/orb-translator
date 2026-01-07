
import { GoogleGenAI, Modality } from "@google/genai";
import { decodeBase64, decodeAudioData } from "./audioUtils";

export interface TranslationResult {
  audioBuffer: AudioBuffer;
  translatedText: string;
}

export class GeminiTranslator {
  private audioContext: AudioContext;

  constructor(private apiKey: string) {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  async translateAndSpeak(
    text: string, 
    targetLanguage: string, 
    systemPrompt: string = "",
    voiceName: string = "Kore"
  ): Promise<TranslationResult> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    
    // Step 1: Get the translation text first so we can store it in history
    // Using gemini-3-flash-preview for fast, cheap text translation
    const translationResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{
        parts: [{ 
          text: `Context: ${systemPrompt}. Translate the following text into ${targetLanguage}. Output ONLY the translated text: "${text.trim()}"` 
        }]
      }]
    });

    const translatedText = translationResponse.text?.trim() || text.trim();

    // Step 2: Generate the audio for the translated text
    const ttsModelName = "gemini-2.5-flash-preview-tts";
    try {
      const response = await ai.models.generateContent({
        model: ttsModelName,
        contents: [{
          parts: [{ text: `Speak this text: "${translatedText}"` }]
        }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName }
            }
          }
        }
      });

      const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      const base64Audio = part?.inlineData?.data;

      if (!base64Audio) {
        throw new Error("No audio data received from Gemini.");
      }

      const audioBytes = decodeBase64(base64Audio);
      const audioBuffer = await decodeAudioData(audioBytes, this.audioContext);
      
      return { audioBuffer, translatedText };
    } catch (error: any) {
      console.error("Gemini API Error details:", error);
      throw error;
    }
  }

  getAudioContext() {
    return this.audioContext;
  }
}
