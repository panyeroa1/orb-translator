
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { Language } from '../types';

const HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

export interface TranscriptionRecord {
  id: string;
  meeting_id: string;
  speaker_id: string;
  transcribe_text_segment: string;
  full_transcription: string;
  users_all: string[];
  created_at: string;
  user_id?: string | null;
}

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
    console.error('[ORBIT]: Linguistics retrieval failed.', error);
    return null;
  }
}

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
    console.error('[ORBIT]: Synthesizer retrieval failed.', error);
    return null;
  }
}

/**
 * FETCH LOGIC (SELECT)
 */
export async function fetchNewTranscriptions(
  meetingId: string, 
  sinceIso: string,
  excludeSpeakerId?: string
): Promise<TranscriptionRecord[]> {
  if (!meetingId) return [];

  try {
    let url = `${SUPABASE_URL}/rest/v1/transcriptions?meeting_id=eq.${meetingId}&created_at=gt.${sinceIso}&select=id,transcribe_text_segment,created_at,speaker_id,full_transcription,users_all,user_id&order=created_at.asc`;
    
    if (excludeSpeakerId) {
      url += `&speaker_id=neq.${excludeSpeakerId}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: HEADERS
    });

    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error('[ORBIT]: Fetch failed.', error);
    return [];
  }
}

/**
 * SAVE LOGIC (INSERT)
 * Aligned with the provided INSERT INTO "public"."transcriptions" schema.
 */
export async function pushTranscription(
  meetingId: string, 
  segment: string, 
  speakerId: string,
  fullTranscription: string,
  userId: string,
  usersAll: string[] = ["host", "guest1"]
): Promise<boolean> {
  if (!meetingId || !segment) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/transcriptions`, {
      method: 'POST',
      mode: 'cors',
      headers: { ...HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify([{ 
        meeting_id: meetingId, 
        speaker_id: speakerId,
        transcribe_text_segment: segment,
        full_transcription: fullTranscription,
        users_all: usersAll,
        created_at: new Date().toISOString(),
        user_id: userId
      }])
    });
    return response.ok;
  } catch (error) {
    console.error('[ORBIT]: Save failure.', error);
    return false;
  }
}

/**
 * USER REGISTRATION
 * Saves the anonymous user ID to the users table on page load.
 */
export async function registerUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      mode: 'cors',
      headers: { 
        ...HEADERS, 
        'Prefer': 'resolution=ignore-duplicates,return=minimal' 
      },
      body: JSON.stringify([{ 
        id: userId,
        created_at: new Date().toISOString()
      }])
    });
    // 201 Created or 204 No Content (due to ignore-duplicates) are both successes
    return response.status === 201 || response.status === 204;
  } catch (error) {
    console.error('[ORBIT]: User registration failed.', error);
    return false;
  }
}

export async function getOrbitKeys(): Promise<string[]> {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/admin_config?key=eq.orbit_api_keys&select=value`, {
      method: 'GET',
      mode: 'cors',
      headers: HEADERS
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data?.[0]?.value?.keys || [];
  } catch (e) {
    return [];
  }
}

export async function addOrbitKey(newKey: string): Promise<boolean> {
  if (!newKey) return false;
  try {
    const existingKeys = await getOrbitKeys();
    if (existingKeys.includes(newKey)) return true;
    const updatedKeys = [...existingKeys, newKey].slice(-20);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/admin_config?on_conflict=key`, {
      method: 'POST',
      mode: 'cors',
      headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        key: 'orbit_api_keys',
        value: { keys: updatedKeys },
        updated_at: new Date().toISOString()
      })
    });
    return response.ok;
  } catch (e) {
    return false;
  }
}
