# Multimodal Analysis Vertical Layout & TTS Character Streaming Design

## Intent and Context
In the Multimodal Clinical Capture interface (`SelfExamCapture.tsx`), the assessment results are currently placed below both columns across the entire panel. Underneath the protocol checklist in the left column, there is significant unused vertical space, while the right column (camera viewfinder/preview, upload actions, notes, analyze button) is vertically tall.
Furthermore, the assessment result currently appears instantly in full without text streaming, whereas the flight assistant AI (`AIPage.tsx`) provides character-by-character typewriter streaming synchronized with speech synthesis audio playback.

## Goals
1. Reorganize `.self-exam-grid` so the left column forms a vertical layout containing both the protocol guide and the output assessment result, utilizing the free vertical space on the left.
2. Synchronize assessment text output streaming character-by-character with voice assistant text-to-speech (TTS) playback progress, including an active typing cursor.
3. Provide a smooth, weighted typewriter fallback for character streaming when TTS auto-read is disabled, muted, or when operating in an offline environment without audio element progress.
4. Maintain 100% backward compatibility with all existing layout and unit test constraints (e.g. `grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr)`).

## Non-Goals
- Changing the backend multimodal diagnostic endpoints or payload structure.
- Altering the three clinical domains (`ocular_ultrasound`, `dermal_radiation`, `glucometer_nutrition`) or baseline values.
- Modifying other tabs or pages.

## Approaches Considered

### Approach 1: Replace Guide with Result
Replace the protocol guide on the left with the assessment result once analysis completes, providing a toggle button to switch back.
- Pros: Simple container swap.
- Cons: Hides the checklist steps and reference baseline values that the clinician/astronaut needs to compare against the findings.

### Approach 2: Vertical Stack in Left Column (Chosen)
Group the left column into a vertical container (`.self-exam-left-column`). Keep `.self-exam-guide` at the top, and position the assessment result (`.observation-alert`) directly underneath it in the free vertical space.
- Pros: Keeps the reference baseline and procedural steps visible alongside the result; balances the grid against the tall right-side viewfinder/controls; preserves mobile responsiveness.
- Cons: Left column requires vertical flex flow and proper minimum width constraints.

## Technical Design

### 1. Left-Column Layout (`SelfExamCapture.tsx` & `index.css`)
- Introduce `<div className="self-exam-left-column">` wrapping:
  1. `<div className="self-exam-guide">...</div>`
  2. `{latestResult ? <ObservationAlertCard ... /> : <div className="self-exam-empty-result">...</div>}` (or conditionally rendering `observation-alert`).
- Right column remains `.self-exam-capture-box`.
- `.self-exam-left-column` CSS: `display: flex; flex-direction: column; gap: 14px; min-width: 0;`.
- Ensure responsive breakpoints (<820px) stack the left column and right column naturally.

### 2. Character-by-Character TTS Streaming
- Extract or share weighted character computation and ratio mapping:
  - `computeTextWeights(text: string): number[]`: punctuation gets pause weights (e.g. `.` = 4.2, `,` = 2.6, space = 0.45, letters = 1.0) for natural speech cadence matching.
  - `charCountForStreamRatio(cumulativeWeights: number[], ratio: number): number`: binary search finding character count from 0.0 to 1.0 ratio.
- Streaming state in `SelfExamCapture`:
  - `streamState: { findingsRevealed: number; actionsRevealed: number; isStreaming: boolean }`.
  - While TTS plays:
    - `speakAssistantReply` calls `onProgress: (progress) => { ... }`.
    - `targetChars = charCountForStreamRatio(weights, progress.ratio)`.
    - Interval timer (24ms) steps `revealedChars` toward `targetChars`.
    - Display `<span className="typing-cursor" aria-hidden="true" />` while streaming.
  - When speech ends or completes:
    - Set `findingsRevealed = totalChars` and reveal action recommendations and consult warnings.
  - Fallback streaming:
    - When `autoRead` is false or TTS fails, use `fallbackDurationMs = totalWeight * 18ms` to smoothly step through characters character-by-character so the user always sees typewriter streaming.
