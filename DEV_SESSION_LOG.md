
# DEV SESSION LOG

... (previous logs)

## 20250523-230000
**Session ID**: 20250523-230000
**Objective**: Make the app embeddable with specialized layout for iframe usage.
**Summary**: 
- Added `isEmbedded` detection logic using `window.self !== window.top`.
- Implemented automatic bottom-right initial positioning for the ORB when running in an iframe.
- Updated the floating subtitle logic to "lift" by an additional 120px when in embedded mode to avoid collisions with standard bottom-bar UIs.
- Added a new "Embed" tab in the "Matrix Prime" settings sidebar with a copyable iframe code snippet.
- Refined sidebar tabs to include the new Embed section.
**Changes**:
- **App.tsx**: New `isEmbedded` hook, updated `initialX`/`initialY` for `useDraggable`, added `Embed` tab UI, and modified subtitle `bottom` style.
**Results**: The ORB can now be seamlessly integrated into other platforms as a widget, maintaining visibility and functional ergonomics regardless of the host environment's layout.
