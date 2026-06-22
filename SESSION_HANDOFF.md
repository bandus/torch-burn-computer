# Polaris Astronautics Burn Computer — Session Handoff

## v0.7.1 Patch Notes (current — not yet committed at time of writing)

**VCRS CROSS-TRACK WARNING OVERHAULED — Severity-based two-tier system**
The old flat 500 m/s cross-track threshold has been replaced with a smarter severity model. The warning now compares how long it would take to null your cross-track velocity against how long your total approach takes — capturing closure rate, range, and thrust together. An amber advisory appears when nulling would consume more than 10% of your remaining approach time. A red critical warning fires when it would consume more than 50%, meaning you likely cannot null it before arrival and should reduce closure rate or abort.

**VCRS DISTANCE BUG FIXED — Burn range was being double-counted**
The burn computer was incorrectly treating cross-track velocity (VCRS) as a separate orthogonal axis and inflating the computed burn distance via Pythagorean correction. DLL analysis confirms VCRS is a component of VREL, not an independent axis, so this correction was wrong. Burn distances are now calculated cleanly from straight-line range only. Outputs will be slightly shorter on high-VCRS intercepts than in prior versions.

**CALENDAR FIX — 30-day months, DLL confirmed**
Date input validation now correctly accepts any day from 1–30 and rejects day 31. The game uses fixed 30-day months with no leap years; prior versions used real-world Gregorian month lengths, which caused false rejections on valid game dates like February 30.

**GAME DAY LENGTH CORRECTED — 87,658.125 s**
The Ostranauts game day is 87,658.125 seconds, confirmed from the DLL. Prior versions used 87,659 s. This affects calendar display and date math only — burn physics are unaffected.

**UI — VCRS invalid input now shows inline error**
Entering a non-numeric value in the VCRS field no longer triggers the "MISSING OR INVALID INPUT" banner. An inline red note now appears directly below the field instead, keeping the burn solution visible.

**UI — Final Approach cutoff velocity guard**
Final Approach now shows a dedicated warning when the cutoff velocity is set equal to or higher than the closing velocity, which would produce an impossible or infinite deceleration plan.

**UI — Min Reactant Budget shows 0S instead of blank**
When the minimum reactant budget computes to zero, the readout now displays `0S` rather than an empty field.

---

## Project Identity

**Tool:** Polaris Astronautics Manual Torch Burn Guidance Computer
**Stack:** React + Vite, single `App.jsx`, deployed to GitHub Pages
**Live URL:** https://bandus.github.io/torch-burn-computer
**Local path:** `E:\BurnComputer\burn-computer`
**Dev server:** `npm run dev` → localhost:5173
**Deploy sequence:** `findstr "APP_VERSION" src\App.jsx` → `git add -A && git commit -m "..."` → `npm run deploy`
**Current confirmed build:** v0.5.3

---

## What Was Accomplished (MATH AUDIT IMPLEMENTATION — unversioned, uncommitted)

Implemented the confirmed fixes from `MATH_AUDIT_REPORT.md` + `DLL_RESULTS.MD`. All 191 tests pass; `npm run build` clean. Not committed, not deployed, no version bump.

**VCRS CORRECTION REMOVED (ISSUE-1).** The Pythagorean burn-distance inflation (`√(raw² + (|vcrs|·t)²)`) was deleted. DLL confirms VCRS is a *component* of VREL, not an orthogonal axis, so the inflation double-counted cross-track. Burn distance is now the straight-line range (`burn_distance_m = raw_burn_distance_m`), single-pass solve. The "CROSS-TRACK CORRECTION APPLIED" banner was removed.

**HIGH-VCRS WARNING REWORKED (replaces the old 500 m/s flat threshold).** Now severity-based: `vcrsSeverity = (|vcrs|/a) / plan.t_total` — time-to-null vs. time-to-arrival, which captures closure rate, range, and thrust together. Two tiers: amber advisory at >0.10, red "cannot null in time" warning at >0.50. Manual Null Heading + VCRS Null Until readouts preserved.

**VCRS NULL HEADING — confirmed in-game (was an open question).** Positive VCRS → 90° + forward thrust decreases it; negative → 270° + forward thrust increases it toward zero. The existing 90°/270° logic was already correct; no code change.

**CALENDAR — fixed 30-day months (CONFIRMED BUG).** `daysInMonth` returned real-world Gregorian lengths with leap years; DLL confirms every month is exactly 30 game-days, no leap years. Now returns a constant `30`.

**CONSTANTS.** `DAY` 87,659 → **87,658.125 s** (DLL true day length); `AU` …700 → **…000 m** (DLL value). Both are display-only deltas, zero burn-physics impact. Fractional `DAY` required `addGameTime` to stop flooring its offset and `formatTargetDuration` to derive days from the raw value — otherwise rollover/breakdown display broke.

**DEAD CODE.** `EFFICIENCY_TIME_MULTIPLIER` removed (exported, never imported).

**Confirmed correct, no change:** GM (1e9), NO_WAKE_M (300 km), accel-in-G, 0.01 G floor, reactant-budget model, all core solvers.

---

## What Was Accomplished (post-v0.5.3 cleanup — unversioned)

**CLEANUP PASS — Code review fixes (not a user-facing release)**

- Removed unused `framer-motion` dependency
- Fonts moved from CSS `@import` to `<link preconnect/stylesheet>` in `index.html` (fixes render-blocking)
- `index.html`: fixed favicon path to be base-aware, added `<meta name="description">` and `<meta name="theme-color">`
- CSS: deduplicated `.bc-header`/`.bc-panel` background+shadow into shared selector (cuts ~35 lines)
- CSS: removed dead rules — `.bc-status-light.clock`, `@keyframes bc-pulse-slow/-fast/-blink-hard`, `.bc-header.scratch-d`, `.bc-readout-value.dim`
- CSS: added `@media (prefers-reduced-motion: reduce)` block covering flicker, cursor, tooltip, and scanline overlay
- Hoisted `NO_WAKE_M` and `EFFICIENCY_TIME_MULTIPLIER` to top-level constants (were inside component)
- `parseGameTime`: added calendar validation (month 1-12, day 1-daysInMonth)
- Boot `useEffect`: added `booting` to dependency array to satisfy `exhaustive-deps`
- `InputRow`: badge `<span>` → `<button>` with `onFocus/onBlur` for keyboard tooltip access; `<div className="bc-label">` → `<label htmlFor>` via `useId()`; added `aria-invalid`; removed dead `labelStyle`/`disabled` props; added `inputMode` prop (defaults `text`)
- `inputMode="decimal"` applied to purely numeric fields: Current RNG, Current VREL, Tgt Vel (both modes), FA Current RNG, FA Current VREL
- Standalone inputs (Desired Travel Time, Flip Time, Burn Start, Current Time): converted labels to `<label>` elements with `htmlFor`, added `aria-invalid`
- `Readout`: removed dead `dim` prop
- VCRS advisory text: now reports absolute m/s value instead of `%` ratio (which showed "0.0%" when VREL was zero)
- Deleted boilerplate files: `src/App.css`, `src/index.css` (empty), `src/assets/hero.png`, `react.svg`, `vite.svg`
- Removed empty `index.css` import from `main.jsx`

---

## What Was Accomplished (v0.5.3)

**HIGH VCRS WARNING — Absolute Threshold**
Replaced ratio-based check (`vcrsRatioPct > 10`) with flat absolute threshold (`Math.abs(vcrs_mps) > 500`). Warning only fires when VCRS exceeds 500 m/s — below that, RCS handles it mid-burn.

**GAME CLOCK — Requires HH:MM:SS**
`parseGameTime` time-only branch replaced with strict regex `/^(\d{1,2}):(\d{2}):(\d{2})$/`. Partial inputs like `: :`, `12:22:`, and bare `HH:MM` are all rejected. `parseTargetDuration` (duration fields) intentionally left permissive.

**HEADER — Clock Indicator Removed**
Both `bc-status-light clock` spans removed from header JSX.

**REACTANT BUDGET — Tooltip Restored**
Both Burn Plan and Final Approach Reactant Budget fields converted from raw `<div>` + `<input>` to `InputRow` components with tooltip: "Enter the amount of reactant you plan to allocate to this burn. It is not recommended to commit all your available reactant." and `TOOLTIP_IMG_REACTANTBUDGET`.

**MISSING OR INVALID INPUT — Consistent Warning**
Both modes now show matching "MISSING OR INVALID INPUT / One or more fields are empty or non-numeric." warning block when required fields are blank. Burn Plan's old text-list "MISSING FIELDS" warning replaced. Required fields show red border when blank: Current RNG and Current VREL in both modes; Flip Time in Burn Plan.

**MINIMUM THRUST FLOOR (0.01 G)**
Entered acceleration below 0.01 G: red border on input, `NaN` fed to solver, "ACCELERATION BELOW MINIMUM THRUST (0.01 G)" warning shown in both modes. FA constant-burn mode: computed required deceleration below 0.01 G surfaces dedicated error "REQUIRED DECELERATION BELOW MINIMUM THRUST (0.01 G) — CHECK UNITS OR INCREASE RANGE".

**VREL / VCRS Independence Confirmed**
In-game test confirmed the game reports VREL and VCRS as independent axes — no solver correction needed. (Superseded by the Math Audit section above: DLL inspection later showed VCRS is a *component* of VREL; the conclusion — no burn-distance correction — still holds, and the leftover Pythagorean inflation was removed.)

---

## Queued But Not Yet Built

*(nothing queued)*

---

## Deferred / Long-Term Items

- Tooltip pass — add tooltips for Desired Travel Time (game day duration explanation) and Flip Time (bare number = seconds). Tooltip images may need to be created.

---