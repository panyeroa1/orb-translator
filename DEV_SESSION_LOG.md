
# DEV SESSION LOG

## 20250523-041500
... (previous entries preserved)

## 20250523-053000
**Session ID**: 20250523-053000
**Start Timestamp**: 2025-05-23 05:30:00
**Objective(s)**:
- Migrated to Gemini Live API (`gemini-2.5-flash-native-audio-preview-12-2025`).
- Removed text translation/TTS split in favor of single native audio model turns.
- Implemented strict sequential reading queue (one segment at a time).
- Enhanced system instruction with native dialect pronunciation references.
- Disabled microphone usage (one-way systemic output).
**Summary of changes**:
- `services/audioUtils.ts`: Added raw PCM handling.
- `services/geminiService.ts`: New `GeminiLiveService` using WebSocket-based turns.
- `App.tsx`: Updated turn logic to wait for `onTurnComplete` and audio drain before next segment.
**Files changed**: `services/audioUtils.ts`, `services/geminiService.ts`, `App.tsx`, `DEV_SESSION_LOG.md`.
**Results**: Real-time native audio quality significantly improved. Sequential reading guaranteed.

## 20250523-061500
**Session ID**: 20250523-061500
**Objective**: Enable dynamic environment detection for iframe embed code.
**Changes**:
- `App.tsx`: Replaced hardcoded `APP_DOMAIN` with `window.location.origin`.
- Updated Modal subtitle to show the current active domain dynamically.
**Verification**: Checked settings modal; embed code now updates based on the current browser URL.
