
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

/**
 * Fetches the latest transcription segment for a specific meeting.
 * Updated to use the 'transcriptions' table as per user schema.
 */
export async function fetchLatestTranscription(meetingId: string): Promise<string | null> {
  if (!meetingId) return null;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/transcriptions?meeting_id=eq.${meetingId}&select=transcribe_text_segment&order=created_at.desc&limit=1`,
      {
        method: 'GET',
        mode: 'cors',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        }
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
 * Uses upsert logic via 'resolution=ignore-duplicates' to prevent 409 conflicts.
 */
export async function registerUser(userId: string): Promise<boolean> {
  if (!userId) return false;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates'
      },
      body: JSON.stringify([{ id: userId }])
    });

    if (!response.ok) {
      const errText = await response.text();
      
      // Handle RLS Violation (42501)
      if (errText.includes('42501') || response.status === 401) {
        console.warn('SUPABASE RLS ERROR (42501): Permission denied on "users" table.');
        console.warn('ACTION REQUIRED: Run the following SQL in your Supabase Dashboard to enable anonymous registration:');
        console.warn('CREATE POLICY "Allow anon insert" ON public.users FOR INSERT WITH CHECK (true);');
        
        // We return true here because the ID is already in local storage; 
        // failing the server-side log shouldn't break the user experience.
        return true; 
      }

      // 409 Conflict might still happen if 'Prefer' is ignored, which is a success for us.
      if (response.status === 409) return true;
      
      console.error('Supabase register user status error:', response.status, errText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Register user fetch failed (Network/CORS):', error);
    return false;
  }
}
