
import { Language } from './types';

// The existing constants are preserved
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
  // =========================================================================
  // GLOBAL MAJOR LANGUAGES (Original List Maintained + World's Most Spoken)
  // =========================================================================
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese (Mandarin, Standard)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic (Modern Standard)' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch (Standard Netherlands)' },
  { code: 'sv', name: 'Swedish' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'fa', name: 'Persian (Farsi)' },
  { code: 'he', name: 'Hebrew' },
  { code: 'el', name: 'Greek' },

  // New Major Global Languages
  { code: 'bn', name: 'Bengali' },
  { code: 'jv', name: 'Javanese' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'te', name: 'Telugu' },
  { code: 'mr', name: 'Marathi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'ur', name: 'Urdu' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'my', name: 'Burmese' },
  { code: 'km', name: 'Khmer' },
  { code: 'ne', name: 'Nepali' },
  { code: 'lo', name: 'Lao' },
  { code: 'uz', name: 'Uzbek' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'si', name: 'Sinhala' },
  { code: 'hy', name: 'Armenian' },
  { code: 'ka', name: 'Georgian' },

  // =========================================================================
  // CHINESE VARIETIES (Sinitic Languages)
  // =========================================================================
  { code: 'zh-yue', name: 'Yue Chinese (Cantonese)' }, // Most famous is Cantonese
  { code: 'wuu', name: 'Wu Chinese (Shanghainese)' },
  { code: 'min', name: 'Min Chinese (Hokkien, Taiwanese)' },
  { code: 'hak', name: 'Hakka Chinese' },
  { code: 'zh-sw', name: 'Southwestern Mandarin (Sichuanese)' },

  // =========================================================================
  // ARABIC DIALECTS
  // =========================================================================
  { code: 'arz', name: 'Arabic (Egyptian Dialect)' },
  { code: 'apc', name: 'Arabic (Levantine Dialect)' },
  { code: 'ary', name: 'Arabic (Moroccan Dialect / Darija)' },
  { code: 'arq', name: 'Arabic (Algerian Dialect)' },
  { code: 'afb', name: 'Arabic (Gulf Dialect)' },
  { code: 'mt', name: 'Maltese (Semitic Language)' },

  // =========================================================================
  // FRENCH REGIONAL VARIETIES (Including requested Belgian French)
  // =========================================================================
  { code: 'fr-be', name: 'French (Belgian)' }, // French Belgium
  { code: 'fr-ch', name: 'French (Swiss)' },
  { code: 'fr-qc', name: 'French (Quebec / Canadian)' },
  { code: 'fr-ivc', name: 'Ivorian French' },

  // =========================================================================
  // DUTCH DIALECTS AND REGIONAL LANGUAGES (Comprehensive)
  // =========================================================================
  { code: 'nl-be', name: 'Flemish (Belgian Dutch)' }, // Original
  { code: 'af', name: 'Afrikaans' }, // Original
  { code: 'fy', name: 'West Frisian' }, // Separate recognized language
  { code: 'li', name: 'Limburgish' }, // Recognized regional language
  { code: 'nds', name: 'Dutch Low Saxon (Nedersaksisch)' }, // Recognized regional language
  { code: 'zea', name: 'Zeelandic (Zeêuws)' },
  { code: 'nl-brb', name: 'Brabantian Dialect' },
  { code: 'nl-hol', name: 'Hollandic Dialect' },

  // =========================================================================
  // PHILIPPINES MAJOR LANGUAGES & DIALECTS (Most Major Dialects + Mixes)
  // =========================================================================
  { code: 'tl', name: 'Filipino (Tagalog)' }, // Original
  { code: 'en-tl', name: 'Taglish (Tagalog-English Mix)' }, // Tagalog English Mix
  { code: 'en-ceb', name: 'Bislish (Cebuano-English Mix)' },
  { code: 'ceb', name: 'Cebuano (Bisaya)' }, // Original
  { code: 'ilo', name: 'Ilocano' }, // Original
  { code: 'hil', name: 'Hiligaynon (Ilonggo)' }, // Original
  { code: 'war', name: 'Waray-Waray' }, // Original
  { code: 'pam', name: 'Kapampangan' }, // Original
  { code: 'pag', name: 'Pangasinan' }, // Original
  { code: 'bik', name: 'Bicolano (Central)' }, // Original
  { code: 'cbk', name: 'Chavacano (Spanish Creole)' }, // Original
  { code: 'mag', name: 'Maguindanaon' }, // Original
  { code: 'tsg', name: 'Tausug' }, // Original
  { code: 'mrw', name: 'Maranao' }, // Original
  { code: 'sur', name: 'Surigaonon' }, // Original
  { code: 'kya', name: 'Kinaray-a' }, // Original
  { code: 'akl', name: 'Aklanon' },
  { code: 'mas', name: 'Masbateño' },
  { code: 'ron', name: 'Romblomanon' },
  { code: 'sbl', name: 'Sambal' },

  // =========================================================================
  // CAMEROON REGIONAL LANGUAGES & DIALECTS (Medumba + Major Groups)
  // =========================================================================
  { code: 'cm-fr', name: 'Cameroon French' }, // Original
  { code: 'cm-en', name: 'Cameroon English' }, // Original
  { code: 'cm-pid', name: 'Cameroonian Pidgin English (Kamtok)' },
  { code: 'cm-mix', name: 'Camfranglais (Youth Mix)' },
  { code: 'byv', name: 'Medumba' }, // Requested: Medumba (ISO for Byangom, a Bamiléké language)
  { code: 'dua', name: 'Duala' }, // Original
  { code: 'ewo', name: 'Ewondo' }, // Original
  { code: 'bam', name: 'Bamum' }, // Original
  { code: 'ful', name: 'Fulfulde (Pulaar) - North' }, // Original
  { code: 'bul', name: 'Bulu' }, // Original
  { code: 'bbj', name: 'Ghomala\'' }, // Original (Major Bamileke)
  { code: 'bas', name: 'Basaa' },
  { code: 'lmb', name: 'Limbum' },
  { code: 'baf', name: 'Bamileke-Fe’fe’' },
  { code: 'kff', name: 'Kom' },

  // =========================================================================
  // IVORY COAST (Côte d'Ivoire) REGIONAL LANGUAGES (All Major Dialects + Slang)
  // =========================================================================
  { code: 'nci', name: 'Nouchi (Ivory Coast Slang Mix)' }, // Slang/Creole
  { code: 'bci', name: 'Baoulé' }, // Original
  { code: 'dyu', name: 'Dioula (Jula) - Lingua Franca' }, // Original
  { code: 'bet', name: 'Bété' }, // Original
  { code: 'sef', name: 'Senoufo (Cebaara)' }, // Original
  { code: 'any', name: 'Agni (Anyin)' }, // Original
  { code: 'dnj', name: 'Yacouba (Dan)' }, // Original
  { code: 'wec', name: 'Guéré (Wè)' }, // Original
  { code: 'did', name: 'Dida' }, // Original
  { code: 'abi', name: 'Abbey' }, // Original
  { code: 'ati', name: 'Attié' }, // Original
  { code: 'nzi', name: 'Nzima' }, // Original
  { code: 'kro', name: 'Krou' }, // Original
  { code: 'goa', name: 'Gouro' },
  { code: 'ebr', name: 'Ebrié' },
  { code: 'adj', name: 'Adioukrou' },
  { code: 'abr', name: 'Abron' },

  // =========================================================================
  // AFRICA & OTHER REGIONS (Expanded)
  // =========================================================================
  { code: 'sw', name: 'Swahili' }, // Original
  { code: 'yo', name: 'Yoruba' }, // Original
  { code: 'ig', name: 'Igbo' }, // Original
  { code: 'zu', name: 'Zulu' }, // Original
  { code: 'xh', name: 'Xhosa' }, // Original
  { code: 'am', name: 'Amharic' }, // Original
  { code: 'ha', name: 'Hausa' }, // Original
  { code: 'uk', name: 'Ukrainian' }, // Original
  { code: 'ro', name: 'Romanian' }, // Original
  { code: 'hu', name: 'Hungarian' }, // Original
  { code: 'cs', name: 'Czech' }, // Original
  { code: 'sk', name: 'Slovak' }, // Original
  { code: 'bg', name: 'Bulgarian' }, // Original
  { code: 'hr', name: 'Croatian' }, // Original
  { code: 'sr', name: 'Serbian' }, // Original
  { code: 'fi', name: 'Finnish' }, // Original
  { code: 'no', name: 'Norwegian (Bokmål)' }, // Original
  { code: 'nn', name: 'Norwegian (Nynorsk)' },
  { code: 'da', name: 'Danish' }, // Original
  { code: 'sn', name: 'Shona' },
  { code: 'mg', name: 'Malagasy' },
  { code: 'wo', name: 'Wolof' },
  { code: 'qu', name: 'Quechua (South American Indigenous)' }, // Major indigenous
  { code: 'grn', name: 'Guaraní (Paraguay Indigenous)' }, // Major indigenous
  { code: 'ay', name: 'Aymara' }, // Major indigenous
  { code: 'is', name: 'Icelandic' },
  { code: 'ga', name: 'Irish (Gaelic)' },
  { code: 'et', name: 'Estonian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'sq', name: 'Albanian' },
  { code: 'bho', name: 'Bhojpuri' },
];

export const ORB_SIZE = 150;
export const POLLING_INTERVAL_MIN = 800;
export const POLLING_INTERVAL_MAX = 2000;
export const CHUNK_PUNCTUATION = /[.!?…]$/;
export const CHUNK_MIN_LENGTH = 40;
export const CHUNK_SILENCE_TIMEOUT = 800;
