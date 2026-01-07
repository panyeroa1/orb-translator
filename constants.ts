
import { Language } from './types';

export const SUPABASE_URL = 'https://xscdwdnjujpkczfhqrgu.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzY2R3ZG5qdWpwa2N6Zmhxcmd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMzEwNjgsImV4cCI6MjA3NjkwNzA2OH0.xuVAkWA5y1oDW_jC52I8JJXF-ovU-5LIBsY9yXzy6cA';

export const GREEK_VOICES = [
  { id: 'Zephyr', name: 'Minos (King of Crete)' },
  { id: 'Puck', name: 'Alexander (King of Macedon)' },
  { id: 'Charon', name: 'Leonidas (King of Sparta)' },
  { id: 'Kore', name: 'Olympias (Queen of Macedon)' },
  { id: 'Fenrir', name: 'Agamemnon (King of Mycenae)' },
];

export const LANGUAGES: Language[] = [
  // Global Major Languages
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese (Mandarin)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'fa', name: 'Persian' },
  { code: 'he', name: 'Hebrew' },
  { code: 'el', name: 'Greek' },

  // Philippines Regional Languages & Dialects
  { code: 'tl', name: 'Filipino (Tagalog)' },
  { code: 'ceb', name: 'Cebuano (Bisaya)' },
  { code: 'ilo', name: 'Ilocano' },
  { code: 'hil', name: 'Hiligaynon (Ilonggo)' },
  { code: 'war', name: 'Waray-Waray' },
  { code: 'pam', name: 'Kapampangan' },
  { code: 'pag', name: 'Pangasinan' },
  { code: 'bik', name: 'Bicolano' },
  { code: 'cbk', name: 'Chavacano' },
  { code: 'mag', name: 'Maguindanaon' },
  { code: 'tsg', name: 'Tausug' },
  { code: 'mrw', name: 'Maranao' },
  { code: 'sur', name: 'Surigaonon' },
  { code: 'kya', name: 'Kinaray-a' },

  // Cameroon Regional Languages & Dialects
  { code: 'cm-fr', name: 'Cameroon French' },
  { code: 'cm-en', name: 'Cameroon English' },
  { code: 'med', name: 'Medumba' },
  { code: 'dua', name: 'Duala' },
  { code: 'ewo', name: 'Ewondo' },
  { code: 'bam', name: 'Bamum' },
  { code: 'ful', name: 'Fulfulde (Pulaar)' },
  { code: 'bul', name: 'Bulu' },
  { code: 'bbj', name: 'Ghomala\'' },
  { code: 'bas', name: 'Basaa' },
  { code: 'fng', name: 'Fanagalo' },
  { code: 'yav', name: 'Yangben' },

  // Ivory Coast (Côte d'Ivoire) Regional Languages
  { code: 'bci', name: 'Baoulé' },
  { code: 'dyu', name: 'Dioula (Jula)' },
  { code: 'bet', name: 'Bété' },
  { code: 'sef', name: 'Senoufo (Cebaara)' },
  { code: 'any', name: 'Agni (Anyin)' },
  { code: 'dnj', name: 'Yacouba (Dan)' },
  { code: 'wec', name: 'Guéré (Wè)' },
  { code: 'did', name: 'Dida' },
  { code: 'abi', name: 'Abbey' },
  { code: 'ati', name: 'Attié' },
  { code: 'nzi', name: 'Nzima' },
  { code: 'kro', name: 'Krou' },

  // Dutch Regional / Variations
  { code: 'nl-be', name: 'Flemish (Belgian Dutch)' },
  { code: 'af', name: 'Afrikaans' },

  // Africa & Other Regions
  { code: 'sw', name: 'Swahili' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'ig', name: 'Igbo' },
  { code: 'zu', name: 'Zulu' },
  { code: 'xh', name: 'Xhosa' },
  { code: 'am', name: 'Amharic' },
  { code: 'ha', name: 'Hausa' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ro', name: 'Romanian' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'cs', name: 'Czech' },
  { code: 'sk', name: 'Slovak' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'da', name: 'Danish' }
];

export const ORB_SIZE = 80;
export const POLLING_INTERVAL_MIN = 800;
export const POLLING_INTERVAL_MAX = 2000;
export const CHUNK_PUNCTUATION = /[.!?…]$/;
export const CHUNK_MIN_LENGTH = 40;
export const CHUNK_SILENCE_TIMEOUT = 800;
