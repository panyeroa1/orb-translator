
export enum OrbStatus {
  IDLE = 'Idle',
  FETCHING = 'Fetching',
  TRANSLATING = 'Translating',
  BUFFERING = 'Buffering',
  SPEAKING = 'Speaking',
  ERROR = 'Error'
}

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
