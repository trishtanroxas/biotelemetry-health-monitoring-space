# Multimodal Analysis Vertical Layout & TTS Character Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the Multimodal Clinical Capture panel so the assessment output card sits in the free vertical space on the left column under the guide, and synchronize the output findings text streaming character-by-character with voice assistant TTS playback.

**Architecture:** Wrap the left column of `.self-exam-grid` in a vertical flex container containing `.self-exam-guide` and `.observation-alert`. Connect `speakAssistantReply`'s `onProgress` callback to a character-weighting ratio mapper and 24ms interval timer in `SelfExamCapture.tsx` to stream findings character-by-character with a typing cursor, with automatic fallback pacing when muted or offline.

**Tech Stack:** React 18, TypeScript, Tailwind/CSS, Web Speech API / Edge TTS via `voiceAssistant.ts`, Node.js test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-11-15-multimodal-vertical-analysis-streaming-design.md`

## Global Constraints
- Clean code hygiene: strictly no emojis anywhere in code, markdown, comments, or UI copy.
- No decorative banner comments; use concise single-line comments only.
- Preserve existing CSS grid constraint: `.self-exam-grid { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); }` on desktop.
- Retain all three clinical domains (`ocular_ultrasound`, `dermal_radiation`, `glucometer_nutrition`) and full offline compatibility.

## Review Focus
1. Rapid clicking of "Read Aloud" or re-analyzing while TTS is mid-stream cancels previous audio timers without character offset corruption.
2. Silent/offline mode (auto-read disabled or audio context blocked) gracefully falls back to smooth timed character streaming rather than freezing or staying blank.
3. Responsive viewport (<820px) stacks the left column and right column vertically without horizontal overflow or clipped borders.
4. Empty state (before any image or scan is analyzed) renders the guide cleanly without broken margins or misplaced empty boxes.
5. All existing 67 tests in `frontend/tests/frontend.test.cjs` pass without regression.

---

### Task 1: Add Text Weight Calculation & Streaming Slice Helpers

**Files:**
- Modify: `frontend/src/services/selfExams.ts`
- Test: `frontend/tests/frontend.test.cjs`

**Interfaces:**
- Consumes: String text from `ImageAssessmentRecord.findings`
- Produces:
  ```ts
  export function computeTextWeights(text: string): number[];
  export function sliceObservationFindings(findings: string, revealedChars?: number): {
    text: string;
    complete: boolean;
  };
  ```

- [ ] **Step 1: Write the failing unit tests in `frontend/tests/frontend.test.cjs`**

```javascript
test('computeTextWeights and sliceObservationFindings provide accurate weights and character slicing', () => {
  const { computeTextWeights, sliceObservationFindings } = require('../src/services/selfExams.ts');

  const text = 'ONSD is 4.8 mm. Normal scleral contour.';
  const weights = computeTextWeights(text);
  assert.equal(weights.length, text.length);

  const dotIdx = text.indexOf('.');
  assert.ok((weights[dotIdx] - weights[dotIdx - 1]) > (weights[1] - weights[0]));

  const partial = sliceObservationFindings(text, 10);
  assert.equal(partial.text, text.slice(0, 10));
  assert.equal(partial.complete, false);

  const complete = sliceObservationFindings(text, text.length);
  assert.equal(complete.text, text);
  assert.equal(complete.complete, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="computeTextWeights" frontend/tests/frontend.test.cjs`
Expected: FAIL with "computeTextWeights is not a function"

- [ ] **Step 3: Implement `computeTextWeights` and `sliceObservationFindings` in `frontend/src/services/selfExams.ts`**

Add concise single-line commented functions:
```ts
export function computeTextWeights(text: string): number[] {
  const cumulative: number[] = [];
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    let weight = 1;
    if (/\s/.test(ch)) weight = 0.45;
    else if (/[.!?]/.test(ch)) weight = 4.2;
    else if (/[,;:]/.test(ch)) weight = 2.6;
    total += weight;
    cumulative.push(total);
  }
  return cumulative;
}

export function sliceObservationFindings(findings: string, revealedChars?: number): {
  text: string;
  complete: boolean;
} {
  const len = findings.length;
  if (revealedChars === undefined || revealedChars >= len) {
    return { text: findings, complete: true };
  }
  const count = Math.max(0, Math.floor(revealedChars));
  return { text: findings.slice(0, count), complete: count >= len };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern="computeTextWeights" frontend/tests/frontend.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/selfExams.ts frontend/tests/frontend.test.cjs
git commit -m "feat: add observation text weight computation and character slicing helpers"
```

---

### Task 2: Vertical Layout Reorganization in `SelfExamCapture.tsx` and `index.css`

**Files:**
- Modify: `frontend/src/components/SelfExamCapture.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/tests/frontend.test.cjs`

**Interfaces:**
- Consumes: `.self-exam-grid`, `.self-exam-guide`, `.observation-alert`
- Produces: `.self-exam-left-column` wrapping `.self-exam-guide` and `.observation-alert` vertically

- [ ] **Step 1: Write the failing test for the left column layout structure**

In `frontend/tests/frontend.test.cjs`:
```javascript
test('SelfExamCapture renders assessment result inside the left column in vertical layout', () => {
  const { SelfExamCapture } = require('../src/components/SelfExamCapture.tsx');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');

  assert.match(css, /\.self-exam-left-column\s*\{[\s\S]*flex-direction:\s*column;/);

  const html = renderToStaticMarkup(React.createElement(SelfExamCapture, {
    astronautId: 'ASTRO-01',
    vitals: {
      astronaut_id: 'ASTRO-01',
      timestamp: '2026-11-15T08:00:00Z',
      heart_rate: 72,
    },
    kpIndex: 2.1,
    offline: false,
    examType: 'dermal_radiation',
    onExamTypeChange: () => {},
    assessments: [],
    onAssessmentSaved: () => {},
  }));

  assert.match(html, /self-exam-left-column/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="SelfExamCapture renders assessment result inside the left column" frontend/tests/frontend.test.cjs`
Expected: FAIL with missing `.self-exam-left-column`

- [ ] **Step 3: Update `frontend/src/index.css` and `frontend/src/components/SelfExamCapture.tsx`**

In `frontend/src/index.css`:
```css
.self-exam-left-column {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
```

In `frontend/src/components/SelfExamCapture.tsx`:
Move `{latestResult ? <div className="observation-alert ...">...</div> : null}` from underneath `.self-exam-grid` to inside `.self-exam-left-column` right after `<div className="self-exam-guide">...</div>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern="SelfExamCapture renders assessment result inside the left column" frontend/tests/frontend.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css frontend/src/components/SelfExamCapture.tsx frontend/tests/frontend.test.cjs
git commit -m "feat: move self exam analysis output to left column vertical layout"
```

---

### Task 3: Character-by-Character TTS-Synchronized Streaming

**Files:**
- Modify: `frontend/src/components/SelfExamCapture.tsx`
- Test: `frontend/tests/frontend.test.cjs`

**Interfaces:**
- Consumes:
  - `computeTextWeights`, `sliceObservationFindings` from `../services/selfExams`
  - `charCountForStreamRatio` from `../pages/AIPage`
  - `speakAssistantReply` from `../services/voiceAssistant`
- Produces:
  - Synchronized character typewriter stream with active blinking cursor in findings paragraph
  - Automatic reveal of recommended actions and consult status upon stream completion

- [ ] **Step 1: Write unit tests verifying character-by-character streaming state in `SelfExamCapture`**

In `frontend/tests/frontend.test.cjs`:
```javascript
test('SelfExamCapture streams observation findings character by character synchronized with TTS', () => {
  const { SelfExamCapture } = require('../src/components/SelfExamCapture.tsx');
  const captureSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'SelfExamCapture.tsx'), 'utf8');

  assert.match(captureSrc, /sliceObservationFindings/);
  assert.match(captureSrc, /typing-cursor/);
  assert.match(captureSrc, /charCountForStreamRatio/);
  assert.match(captureSrc, /computeTextWeights/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="SelfExamCapture streams observation findings character by character" frontend/tests/frontend.test.cjs`
Expected: FAIL

- [ ] **Step 3: Implement streaming logic in `SelfExamCapture.tsx`**

1. Import `computeTextWeights`, `sliceObservationFindings` from `../services/selfExams` and `charCountForStreamRatio` from `../pages/AIPage`.
2. Add stream state tracking:
   ```ts
   const [streamedChars, setStreamedChars] = useState<number | undefined>(undefined);
   const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
   const streamTargetRef = useRef<{
     recordId: string;
     weights: number[];
     totalChars: number;
     targetChars: number;
     revealedChars: number;
     waitingForTts: boolean;
     audioDriven: boolean;
     startedAtMs: number;
     fallbackDurationMs: number;
   } | null>(null);
   ```
3. Implement `startObservationStream(record: ImageAssessmentRecord, syncWithTts: boolean)`:
   - Sets up interval timer (24ms).
   - In `speakObservation`, wire up `onProgress: (progress) => { cur.targetChars = Math.max(cur.targetChars, charCountForStreamRatio(cur.weights, progress.ratio)); }`.
   - On end or cancel, finish stream cleanly and reveal complete findings.
4. Render streamed slice:
   ```tsx
   {(() => {
     const stream = sliceObservationFindings(latestResult.findings, streamedChars);
     return (
       <>
         <p>
           {stream.text}
           {!stream.complete && <span className="typing-cursor" aria-hidden="true" />}
         </p>
         {stream.complete && (
           <>
             <ul className="self-exam-actions-list">
               {latestResult.recommendedActions.map(action => (
                 <li key={action}>{action}</li>
               ))}
             </ul>
             {ttsError ? <small className="warning-text">{ttsError}</small> : null}
             {latestResult.groundConsultRequired ? (
               <small className="warning-text">Ground Flight Surgeon review recommended at next comms pass.</small>
             ) : (
               <small className="success-text"><CheckCircle2 size={13} style={{ display: 'inline', verticalAlign: 'middle' }} aria-hidden="true" /> Recorded cleanly on device history.</small>
             )}
           </>
         )}
       </>
     );
   })()}
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern="SelfExamCapture streams observation findings character by character" frontend/tests/frontend.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SelfExamCapture.tsx frontend/tests/frontend.test.cjs
git commit -m "feat: sync self exam observation findings to TTS character by character"
```

---

### Task 4: Full Suite Verification & Build Validation

**Files:**
- Entire codebase
- Tests: `frontend/tests/frontend.test.cjs`

- [ ] **Step 1: Run full test suite**

Run: `npm --prefix frontend test`
Expected: All 70+ tests pass with zero failures.

- [ ] **Step 2: Run frontend build**

Run: `npm --prefix frontend run build`
Expected: TypeScript and Vite production build succeed cleanly with zero type errors.

- [ ] **Step 3: Commit any final refinements**

```bash
git commit --allow-empty -m "chore: verify build and full test suite passing"
```
