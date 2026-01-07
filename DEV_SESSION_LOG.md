
# DEV SESSION LOG

## 20250523-083000
**Session ID**: 20250523-083000
**Objective**: Hardcode the Pure Translation Engine instruction and remove it from UI settings.
**Changes**:
- `services/geminiService.ts`: Integrated the full provided system prompt as a hardcoded `DEFAULT_SYSTEM_INSTRUCTION`. Removed the external `systemPrompt` parameter from `connect`.
- `App.tsx`: Removed `systemPrompt` state, `localStorage` calls for `orb_prompt`, and the "Neural Heuristics" `textarea` from the settings modal.
**Results**: The engine now operates on a fixed, high-fidelity persona that is non-configurable by users.

## 20250523-090000
**Session ID**: 20250523-090000
**Objective**: Fix "Register user failed: Failed to fetch" error.
**Changes**:
- `services/supabaseService.ts`: Updated `registerUser` to use array-based body and `mode: 'cors'`.
- Changed `Prefer` header to `resolution=ignore-duplicates` for better compatibility.
**Results**: Fetch calls are now more resilient to common CORS/PostgREST misconfigurations.

## 20250523-093000
**Session ID**: 20250523-093000
**Objective**: Fix Supabase RLS violation (42501) on registration.
**Changes**:
- `services/supabaseService.ts`: Added detection for 42501 error code. 
- Implemented console warnings providing the exact SQL needed to fix policies.
**Results**: The app now informs the developer how to fix the database permissions while remaining usable for the end-user.

## 20250523-100000
**Session ID**: 20250523-100000
**Objective**: Enhance Read-Aloud fidelity with a detailed Phonetic Execution Matrix.
**Changes**:
- `services/geminiService.ts`: Expanded `DEFAULT_SYSTEM_INSTRUCTION` with the requested strict translation rules and a detailed Phonetic & Dialectal Execution Matrix.
**Results**: The Gemini Live Audio engine now has explicit instructions to handle glottal stops, tonal contours, and regional cadences (Medumba, Flemish, Nouchi, etc.).
