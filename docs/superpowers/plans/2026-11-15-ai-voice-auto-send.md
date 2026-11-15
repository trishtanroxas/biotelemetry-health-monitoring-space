# AI Assistant Voice Auto-Submit and 3-Second Inactivity Auto-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable automatic submission of voice queries to the AI Assistant model immediately after speech transcription finishes, and automatically end the voice command session after 3 seconds of delay without voice input.

**Architecture:** 
1. In `voiceAssistant.ts`, implement silence detection with a default 3,000 ms timeout across both Web Speech API and MediaRecorder fallback. In Web Speech API, set `continuous = true` and reset the timer on speech/sound/result events. In MediaRecorder, monitor mic energy via `AudioContext` and `AnalyserNode` to reset the timer during speech.
2. In `AIPage.tsx`, update the voice dictation handler so `onFinal` automatically invokes `send(fullPrompt, 'chat')` when the assistant is ready, and prime audio playback on microphone activation so Auto-read TTS replies play without browser autoplay blocks.
3. In `frontend.test.cjs`, add tests verifying the 3-second inactivity auto-end and the auto-send behavior, ensuring zero regression across the existing test suite.

**Tech Stack:** React 19, TypeScript, Web Speech API (`SpeechRecognition`), MediaStream / MediaRecorder, Web Audio API (`AudioContext`, `AnalyserNode`), Node.js test runner.

**Spec:** User request specifying auto-submission after transcription and a 3-second inactivity auto-end without voice input.

## Global Constraints
- Clean code hygiene: strictly no emojis in source code or comments; single-line explanatory comments only; no decorative banner comments.
- Non-blocking: all timers, audio contexts, and media tracks must clean up reliably on stop/unmount to prevent memory leaks and orphaned streams.
- Zero regressions: all 66 existing tests in `frontend/tests/frontend.test.cjs` must continue to pass cleanly.

## Review Focus
- Browser compatibility: SSR and headless environments without `window.AudioContext` or `window.SpeechRecognition` must degrade gracefully without exceptions.
- Edge cases: user pauses for < 3s during speech (must not end prematurely); user says nothing for 3s (must end cleanly with "No speech detected" without sending empty prompt); user is offline (must preserve transcribed text in input rather than dropping it).

---

### Task 1: Silence Detection and Inactivity Auto-End in `voiceAssistant.ts`

- [x] **Step 1: Define delay constant and update interface types**
  - In `frontend/src/services/voiceAssistant.ts`, export `VOICE_SILENCE_DELAY_MS = 3000`.
  - Add optional `silenceTimeoutMs?: number` to `VoiceDictationCallbacks`.

- [x] **Step 2: Add 3-second silence detection to Web Speech API in `startVoiceDictation`**
  - Set `recognition.continuous = true` and `recognition.interimResults = true`.
  - Maintain `silenceTimer`, `accumulatedFinal`, `latestInterim`, and `hadVoiceInput`.
  - Reset `silenceTimer` to 3,000 ms on `onspeechstart`, `onsoundstart`, and each `onresult`.
  - On silence timeout expiration:
    - If no speech was captured and interim/final is empty, trigger `callbacks.onError?.('No speech detected. Hold steady and try again.')` and end dictation.
    - If speech was captured, stop recognition, finalize transcription, and call `callbacks.onFinal(finalTranscript)`.
  - Ensure manual `stop()` also flushes any remaining speech text and clears timers.

- [x] **Step 3: Add Web Audio API volume monitoring to `startRecorderDictation`**
  - Check for `AudioContext` / `webkitAudioContext`.
  - If available, create `AnalyserNode` connected to the `mediaStream` to sample volume every 100ms.
  - When average volume exceeds speech threshold, mark speech detected and reset the 3-second silence timer.
  - When 3 seconds of silence elapse, invoke `stopRecording()`.
  - Ensure all audio contexts, timers, and intervals are safely closed in `releaseMedia()`.

- [x] **Step 4: Verify compilation and existing tests**
  - Run `node --test frontend/tests/frontend.test.cjs` to confirm no regressions.

---

### Task 2: Automated Model Prompting and Audio Priming in `AIPage.tsx`

- [x] **Step 1: Synchronously prime audio playback on mic button activation**
  - In `toggleVoiceInput()`, call `primeAudioPlayback()` if `autoRead && ttsSupported` when starting listening.

- [x] **Step 2: Auto-send full prompt inside `onFinal`**
  - In `toggleVoiceInput()` -> `startVoiceDictation`:
    - In `onFinal`:
      - Determine `fullPrompt = (inputRef.current.trim() ? `${inputRef.current.trim()} ${text}` : text).trim()`.
      - Clear `interimVoice`.
      - If `fullPrompt` is non-empty:
        - If `unavailableRef.current || loading`, set `input` to `fullPrompt`.
        - Otherwise, clear `input` and invoke `void send(fullPrompt, 'chat')`.

- [x] **Step 3: Verify user interaction flow**
  - Run build / typecheck: `npm run build` in `frontend/`.

---

### Task 3: Comprehensive Test Coverage and Final Verification

- [x] **Step 1: Add unit test in `frontend/tests/frontend.test.cjs`**
  - Test that `startVoiceDictation` terminates after 3-second silence timeout when no voice input is detected.
  - Test that speech activity resets the silence timeout and fires `onFinal` upon auto-completion.
  - Test that `AIPage` dispatches message to model automatically on `onFinal`.

- [x] **Step 2: Run all tests**
  - Run `node --test frontend/tests/frontend.test.cjs`.
  - Confirm all tests pass.
