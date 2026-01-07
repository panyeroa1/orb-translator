
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

/**
 * Fetches the latest transcription segment for a specific meeting.
 * Updated to use the 'transcriptions' table as per user schema.
 */
export async function fetchLatestTranscription(meetingId: string): Promise<string | null> {
  if (!meetingId) return null;

  try {
    // Queries the 'transcriptions' table (which now includes user_id column)
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/transcriptions?meeting_id=eq.${meetingId}&select=transcribe_text_segment&order=created_at.desc&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Supabase fetch error:', errText);
      return null;
    }

    const data = await response.json();
    // Use the correct column name from user's schema: 'transcribe_text_segment'
    return data && data.length > 0 ? data[0].transcribe_text_segment : null;
  } catch (error) {
    console.error('Supabase connection failed:', error);
    return null;
  }
}

/**
 * Registers an anonymous user in the 'users' table.
 */
export async function registerUser(userId: string): Promise<boolean> {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates' // Handle cases where user already exists
      },
      body: JSON.stringify({ id: userId })
    });
    return response.ok;
  } catch (error) {
    console.error('Register user failed:', error);
    return false;
  }
}
