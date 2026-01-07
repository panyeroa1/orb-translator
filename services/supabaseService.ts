
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { Language } from '../types';

const HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

/**
 * Fetches the list of supported languages/dialects from the 'languages' table.
 */
export async function fetchLanguages(): Promise<Language[] | null> {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/languages?select=code,name&order=name.asc`, {
      method: 'GET',
      mode: 'cors',
      headers: HEADERS
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Supabase fetch languages failed:', error);
    return null;
  }
}

/**
 * Fetches the list of available Gemini voices from the 'voices' table.
 */
export async function fetchVoices(): Promise<{id: string, name: string}[] | null> {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/voices?select=id,name&order=name.asc`, {
      method: 'GET',
      mode: 'cors',
      headers: HEADERS
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Supabase fetch voices failed:', error);
    return null;
  }
}

/**
 * Fetches the latest transcription segment for a specific meeting.
 */
export async function fetchLatestTranscription(meetingId: string): Promise<string | null> {
  if (!meetingId) return null;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/transcriptions?meeting_id=eq.${meetingId}&select=transcribe_text_segment&order=created_at.desc&limit=1`,
      {
        method: 'GET',
        mode: 'cors',
        headers: HEADERS
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Supabase fetch transcription error:', response.status, errText);
      return null;
    }

    const data = await response.json();
    return data && data.length > 0 ? data[0].transcribe_text_segment : null;
  } catch (error) {
    console.error('Supabase connection failed (Transcription):', error);
    return null;
  }
}

/**
 * Registers an anonymous user in the 'users' table.
 */
export async function registerUser(userId: string): Promise<boolean> {
  if (!userId) return false;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        ...HEADERS,
        'Prefer': 'resolution=ignore-duplicates'
      },
      body: JSON.stringify([{ id: userId }])
    });

    if (!response.ok) {
      const errText = await response.text();
      if (errText.includes('42501') || response.status === 401) {
        console.warn('SUPABASE RLS ERROR (42501): Check public.users insert policy.');
        return true; 
      }
      if (response.status === 409) return true;
      return false;
    }

    return true;
  } catch (error) {
    console.error('Register user fetch failed:', error);
    return false;
  }
}
