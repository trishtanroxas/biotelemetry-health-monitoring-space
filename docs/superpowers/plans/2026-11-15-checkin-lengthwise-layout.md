# Check-In Lengthwise Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Check-In page layout into a lengthwise, space-efficient responsive design utilizing the full width on desktop with a two-column split (primary form + sticky telemetry sidebar) and multi-column field flow.

**Architecture:** Update `frontend/src/index.css` and `frontend/src/pages/CheckInPage.tsx` so `.checkin-workspace` expands from a narrow 850px container to `max-width: 1340px; width: 100%;`. On viewports `>= 1024px`, apply CSS grid separating the wizard form (left) from a sticky live telemetry sidebar (right). Enhance `.form-grid` and `.review-grid` to spread input controls lengthwise across the available width without horizontal overflowing.

**Tech Stack:** React 19, TypeScript, CSS Grid & Flexbox, Node.js test runner.

**Spec:** Approach 1 approved by user: two-column layout on desktop with wide form on left and sticky telemetry sidebar on right.

## Global Constraints
- Clean code hygiene: strictly no emojis in source code or comments; single-line explanatory comments only; no decorative banner comments.
- Zero regressions: all 67 existing tests in `frontend/tests/frontend.test.cjs` must continue to pass cleanly.
- Strict responsive fidelity: zero horizontal scrollbars or element clipping from 360px mobile up to 4K desktop.

## Review Focus
- Mobile fallback: screens `< 1024px` must gracefully stack in a single column.
- Sticky behavior: the telemetry sidebar must remain fixed during scrolling on desktop without obscuring navigation or overlapping footer.
- Accessible form controls: rating pill rows, inputs, and dropdowns must maintain minimum touch targets and clear focus rings.

---

### Task 1: Update CSS Styles for Lengthwise Two-Column Layout

- [x] **Step 1: Update `.checkin-workspace` and responsive grid in `frontend/src/index.css`**
  - Increase `.checkin-workspace` max-width to `1340px` and set `width: 100%`.
  - In desktop media query (`@media(min-width: 1024px)`), apply `display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 26px; align-items: start;`.
  - In large desktop media query (`@media(min-width: 1280px)`), refine sidebar width to `350px` with `gap: 30px`.
  - Set `.checkin-context` to `position: sticky; top: 24px; margin-top: 0;` on desktop.

- [x] **Step 2: Enhance form field distribution and review grid in `frontend/src/index.css`**
  - Ensure `.form-grid` on desktop gracefully supports 2 to 3 columns where appropriate.
  - Update `.review-grid` on desktop to 3 columns (`repeat(3, minmax(0, 1fr))`) to use the lengthwise width cleanly.
  - Ensure `.checkin-workspace > .helper` and `.checkin-workspace > .warning-box` span the full width cleanly across grid columns.

- [x] **Step 3: Update `CheckInPage.tsx` structure if needed**
  - Ensure draft status and warnings span the top of the workspace or sit within the form column appropriately.
  - Verify semantic HTML, aria landmarks, and class bindings.

---

### Task 2: Verification and Test Suite

- [x] **Step 1: Verify layout with test suite**
  - Run `node --test frontend/tests/frontend.test.cjs`.
  - Ensure all 67 tests pass.

- [x] **Step 2: Add CSS layout verification test in `frontend.test.cjs`**
  - Add assertion verifying `.checkin-workspace` grid layout, max-width, and sticky sidebar rules.

- [x] **Step 3: Production build verification**
  - Run `npm --prefix frontend run build` (`tsc && vite build`) and confirm clean build.
