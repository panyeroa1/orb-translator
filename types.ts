
export enum OrbStatus {
  IDLE = 'Idle',
  FETCHING = 'Fetching',
  TRANSLATING = 'Translating',
  BUFFERING = 'Buffering',
  SPEAKING = 'Speaking',
  ERROR = 'Error',
  RECORDING = 'Recording'
}

export type AppMode = 'translate' | 'speaker';
export type TranscriptionEngine = 'pro' | 'beta' | 'main';
export type InputSource = 'mic' | 'internal' | 'screen';

export type EmotionTone = 'NEUTRAL' | 'HAPPY' | 'SAD' | 'ANGRY' | 'URGENT' | 'CALM' | 'INTENSE' | 'CURIOUS';

export interface TranscriptionResponse {
  id?: string;
  ts?: string;
  text: string;
}

export interface Language {
  code: string;
  name: string;
}

export interface AudioSegment {
  id: string;
  text: string;
  audioBuffer: AudioBuffer;
}

export interface HistoryEntry {
  id: string;
  originalText: string;
  translatedText: string;
  timestamp: number;
}
