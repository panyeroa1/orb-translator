
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { Language } from '../types';

const HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

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

    if (!response.ok) return null;
    const data = await response.json();
    return data && data.length > 0 ? data[0].transcribe_text_segment : null;
  } catch (error) {
    return null;
  }
}

export async function pushTranscription(meetingId: string, text: string): Promise<boolean> {
  if (!meetingId || !text) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/transcriptions`, {
      method: 'POST',
      mode: 'cors',
      headers: { ...HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify([{ 
        meeting_id: meetingId, 
        transcribe_text_segment: text,
        created_at: new Date().toISOString()
      }])
    });
    return response.ok;
  } catch (error) {
    console.error('[ORBIT]: Broadcaster failure.', error);
    return false;
  }
}

export async function registerUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      mode: 'cors',
      headers: { ...HEADERS, 'Prefer': 'resolution=ignore-duplicates' },
      body: JSON.stringify([{ id: userId }])
    });
    return response.ok || response.status === 409;
  } catch (error) {
    return false;
  }
}

/**
 * ORBIT KEY MANAGEMENT
 */

const ADMIN_CONFIG_KEY = 'orbit_api_keys';

export async function getOrbitKeys(): Promise<string[]> {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/admin_config?key=eq.${ADMIN_CONFIG_KEY}&select=value`, {
      method: 'GET',
      mode: 'cors',
      headers: HEADERS
    });
    if (!response.ok) {
      console.warn("[ORBIT]: Memory bank access restricted or empty.");
      return [];
    }
    const data = await response.json();
    if (data && data.length > 0 && Array.isArray(data[0].value?.keys)) {
      return data[0].value.keys;
    }
    return [];
  } catch (e) {
    console.error("[ORBIT]: Memory retrieval system failure.");
    return [];
  }
}

export async function addOrbitKey(newKey: string): Promise<boolean> {
  if (!newKey) return false;
  try {
    const existingKeys = await getOrbitKeys();
    if (existingKeys.includes(newKey)) return true;
    const updatedKeys = [...existingKeys, newKey].slice(-20);
    const payload = {
      key: ADMIN_CONFIG_KEY,
      value: { keys: updatedKeys },
      updated_at: new Date().toISOString()
    };

    const response = await fetch(`${SUPABASE_URL}/rest/v1/admin_config?on_conflict=key`, {
      method: 'POST',
      mode: 'cors',
      headers: { 
        ...HEADERS, 
        'Prefer': 'resolution=merge-duplicates,return=minimal' 
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[ORBIT]: Token injection rejected by server.", errBody);
      return false;
    }

    return true;
  } catch (e) {
    console.error("[ORBIT]: Token persistence hardware failure.", e);
    return false;
  }
}
