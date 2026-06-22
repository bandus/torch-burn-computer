# CODE REVIEW REPORT — Polaris Astronautics Manual Torch Burn Guidance Computer

**Date:** 2026-06-21
**Scope:** Full project — `src/physics.js`, `src/App.jsx`, `src/physics.test.js`, `src/main.jsx`, `index.html`, `vite.config.js`, `eslint.config.js`, `package.json`, `.github/workflows/{ci,deploy}.yml`
**Method:** Complete read of every source file; `npm run lint`; `npx vitest run`; cross-check against `CLAUDE.md`, `SESSION_HANDOFF.md`, `MATH_AUDIT_REPORT.md`, `DLL_RESULTS.MD`. Math engine trusted per the completed audit; not re-derived.

---

## EXECUTIVE SUMMARY

The codebase is healthy. The math engine is correct (per the prior audit, re-confirmed by 96 passing tests), and no finding produces a wrong burn number on valid input — there are **zero CRITICAL app-output bugs**. The notable items are: one **EDGE regression introduced by the recent VCRS-correction removal** (invalid VCRS now renders a valid burn solution *and* a "missing input" banner simultaneously — FINDING-4); a **lint failure** (`npm run lint` currently exits non-zero — pre-existing dead imports plus two unused params introduced by the 30-day-month fix — FINDING-1, FINDING-2, FINDING-3); a **duplicate/conflicting deploy pipeline** (two workflows both deploy on push to `main` — FINDING-5); and **lint + test pollution from a stray git worktree** under `.claude/` (FINDING-6). The rest are coverage gaps (`buildDriftPlan` and receding-`v0` are untested — FINDING-7, FINDING-8) and low-impact hygiene/edge items.

**Findings by severity:** CRITICAL 0 · EDGE 6 · DEAD 4 · REDUNDANT 1 · HYGIENE 7 · PERF 1 · COVERAGE 4 (several findings carry multiple tags).

**Highest priority:** FINDING-4 (contradictory VCRS UI state), FINDING-1/2/3 (lint is red → CI `lint` step fails), FINDING-5 (double deploy), FINDING-6 (worktree pollutes lint/test).

---

## TEST SUITE RESULTS

- **Active suite (`src/physics.test.js`): 96 tests, 96 passing.**
- `npm test` / `npx vitest run` reports **191 tests across 2 files** because vitest also discovers `.claude/worktrees/lucky-launching-panda/src/physics.test.js` (a registered git worktree at commit `7187837`). That stale copy contributes ~95 tests and is **not** part of the active codebase. See FINDING-6.
- No failures in either copy.

**Lint:** `npm run lint` **exits 1** (10 errors). In the active tree: `DAY`/`daysInMonth` unused imports (App.jsx), two empty `catch` blocks (App.jsx), and `mo`/`y` unused params (physics.js). The remaining errors are the duplicate worktree copy. See FINDING-1/2/3/6.

---

## NEW DLL LOOKUPS

None. No finding depended on a game mechanic beyond what `DLL_RESULTS.MD` already confirms. (One adjacent observation — the game's `NavModTorchDrive.GetLimiterSafetyMax` implies a per-ship thrust ceiling — is noted under DECISIONS, not filed as a bug, because it is per-ship and has no global constant the tool could key off.)

---

## FINDINGS

---
**FINDING-1** [DEAD]
**Location:** `src/App.jsx:7` (`DAY`), `src/App.jsx:15` (`daysInMonth`)
**Summary:** Two imports from `physics.js` are never used in `App.jsx`.
**Detail:** `DAY` and `daysInMonth` appear only in the import list. `App.jsx` never references either (`daysInMonth` is used internally by `parseGameTime` inside `physics.js`, not here). ESLint flags both as `no-unused-vars`, which makes `npm run lint` fail and therefore fails the CI `lint` step. Pre-existing (present in the committed worktree copy too).
**Proposed fix:** Remove `DAY,` and `daysInMonth,` from the import block at `App.jsx:4–24`.
**Risk if unfixed:** CI lint stays red; dead imports mislead readers into thinking the module uses game-calendar logic directly.

---
**FINDING-2** [DEAD + HYGIENE]
**Location:** `src/physics.js:69` — `export function daysInMonth(mo, y)`
**Summary:** `daysInMonth` parameters `mo`/`y` are now unused after the fixed-30-day change.
**Detail:** The function body was reduced to `return 30;`, leaving `mo` and `y` unreferenced. ESLint flags both (`no-unused-vars`). These two errors are **new** — introduced by the audit-implementation change — and are the only lint regressions this work added.
**Proposed fix:** Drop the parameters: `export function daysInMonth() { return 30; }`. Existing call sites (`parseGameTime`, `addGameTime`) pass arguments; JS ignores the extra args, so no call-site edits are needed. (Keep a one-line JSDoc noting the fixed-length calendar.)
**Risk if unfixed:** CI lint stays red.

---
**FINDING-3** [HYGIENE]
**Location:** `src/App.jsx:56` (`_lsSave` catch), `src/App.jsx:274` (`history.replaceState` catch)
**Summary:** Two empty `catch {}` blocks trip ESLint `no-empty`.
**Detail:** Both intentionally swallow errors (private-mode localStorage, restricted history API), but the empty body is a lint error. Other catches in the file (e.g. `:41`, `:177`) carry an explanatory comment and pass.
**Proposed fix:** Add a comment inside each block, e.g. `/* storage unavailable — ignore */` and `/* history API blocked — ignore */`.
**Risk if unfixed:** CI lint stays red.

---
**FINDING-4** [EDGE]
**Location:** `src/App.jsx:770` (`burnMissingFields` includes `'VCRS'`), interacting with `:761` (`planValid`) and `:509`/`:519` (plan no longer consumes `vcrs_mps`)
**Summary:** Non-numeric VCRS now yields a *contradictory* UI: a complete, valid burn solution renders **and** the "MISSING OR INVALID INPUT" banner shows at the same time.
**Detail:** The recent VCRS-correction removal means `vcrs_mps` no longer feeds `computePlan`. So with garbage in the VCRS field (e.g. `0.5x` → `vcrs_mps = NaN`), `plan` computes normally and `planValid` is true (it does not consider `burnMissingFields`), so all readouts render. Simultaneously, `burnMissingFields` still lists `VCRS` (line 770), so the red "One or more fields are empty or non-numeric" banner also renders. Before the correction removal these states were consistent (a NaN VCRS poisoned `burn_distance_m` and forced a plan error). This is a regression from that change. Reachable by typing any non-numeric character into Current VCRS.
**Proposed fix (DECISION — see DECISIONS #1):** Default — remove the `VCRS` entry from `burnMissingFields` (lines 770), since VCRS no longer affects the solve; instead, surface invalid VCRS only by suppressing the advisory (already happens) and optionally a small inline field note. Alternative — keep VCRS required and add `burnMissingFields.length === 0` to the `planValid` predicate so results are withheld until VCRS is valid.
**Risk if unfixed:** User sees a burn plan and an "invalid input" alarm together and cannot tell which to trust.

---
**FINDING-5** [REDUNDANT]
**Location:** `.github/workflows/ci.yml:31–53` (the `deploy` job) vs `.github/workflows/deploy.yml` (entire file)
**Summary:** Two different deploy mechanisms both run on every push to `main`.
**Detail:** `ci.yml` has a `deploy` job that runs `npm run deploy` (gh-pages → pushes to a `gh-pages` branch). `deploy.yml` builds and deploys via the official `actions/deploy-pages` artifact flow. Both trigger on `push: branches: [main]`. Commit `7187837 "switch to GitHub Actions deployment"` and `CLAUDE.md` indicate `deploy.yml` is the intended path. Running both races two publish methods against the same Pages site; whichever the Pages "Source" setting ignores is wasted CI time at best and a flapping/incorrect deploy at worst.
**Proposed fix:** Remove the `deploy` job from `ci.yml` (lines 31–53), leaving `ci.yml` as lint+test+build only; keep `deploy.yml` as the sole deployer. (Confirm the repo's Pages "Source" is set to "GitHub Actions".)
**Risk if unfixed:** Conflicting/duplicate deploys, wasted minutes, and ambiguity about which build is live.

---
**FINDING-6** [HYGIENE + COVERAGE]
**Location:** `eslint.config.js:8` (`globalIgnores(['dist'])`), `vite.config.js:55–57` (vitest config), and the registered worktree `.claude/worktrees/lucky-launching-panda`
**Summary:** A stray git worktree under `.claude/` is linted and tested alongside the real source.
**Detail:** `git worktree list` shows a second checkout at `.claude/worktrees/lucky-launching-panda` (commit `7187837`). Because it lives inside the project and is not ignored, ESLint scans its `App.jsx` (duplicating every lint error) and vitest discovers its `physics.test.js` (~95 extra tests, masking the true active count). Test/lint signal is doubled and partly stale.
**Proposed fix:** Add `.claude` to ESLint `globalIgnores` (`globalIgnores(['dist', '.claude'])`) and to vitest `test.exclude` (e.g. `exclude: ['**/node_modules/**', '**/.claude/**']`). Optionally remove the worktree entirely if it is no longer needed (`git worktree remove`). The `.claude/` directory is currently untracked.
**Risk if unfixed:** Misleading test counts, duplicated lint noise, and the possibility of "passing" on stale duplicated code.

---
**FINDING-7** [COVERAGE]
**Location:** `src/physics.js:500` (`buildDriftPlan`) — not imported in `src/physics.test.js`
**Summary:** `buildDriftPlan` has no test coverage at all.
**Detail:** It is exported and used by the drift/budget path in `App.jsx:553`, but the test file never imports or exercises it — neither the happy path (drift phase present), the `t_dr = 0` clamp, nor the `d_dr < -1 → null` (no-room) return.
**Proposed fix:** Add a `describe('buildDriftPlan')` block covering: a valid drift plan whose phase distances sum to `distance_m`; the `null` return when `v_max` is too high for any drift; and the `d_drift`/`t_drift` clamp at zero.
**Risk if unfixed:** Regressions in the drift solver ship silently.

---
**FINDING-8** [COVERAGE]
**Location:** `src/physics.test.js` `describe('computePlan')` — base uses `v0_mps: 500` (closing) only
**Summary:** The receding (`v0 < 0`) path of `computePlan` is never tested.
**Detail:** Signed-`v0` handling is a documented, load-bearing convention (`CLAUDE.md`), and the audit verified it numerically with `v0 = -300`, but the suite has no receding case. Same gap for `buildDriftPlan` and the budget path.
**Proposed fix:** Add a `computePlan` test with `v0_mps` negative asserting distance conservation and `t_accel > (v_max)/a` behavior (receding penalty appears as extra accel time).
**Risk if unfixed:** A sign regression in receding handling would pass CI.

---
**FINDING-9** [COVERAGE]
**Location:** `src/physics.test.js:306–318` (`returns flip_now when already past optimal flip point`)
**Summary:** The `flip_now` test does not actually assert `flip_now`.
**Detail:** The test only asserts the result is neither `error` nor `overshoot` ("Either flip_now or normal success"), so the dedicated `flip_now` branch (`physics.js:324–337`) could break without failing this test.
**Proposed fix:** Construct inputs that deterministically trigger `flip_now` (high `v0`, short distance such that `v_max ≤ v0 + 1e-6`) and assert `result.flip_now === true`, `t_accel === 0`.
**Risk if unfixed:** The flip_now branch is effectively untested.

---
**FINDING-10** [DEAD]
**Location:** `src/physics.js:472–477` (`if (disc < 0) return { error: 'NO SOLUTION EXISTS' … }`)
**Summary:** Unreachable branch in `solveAcceleration`.
**Detail:** As the math audit established, `C_coeff = −(v0−v_arr)² ≤ 0` with `A_coeff > 0`, so `disc = B² − 4AC ≥ B² ≥ 0` always; `disc < 0` never occurs. Harmless, already acknowledged by the existing test comment at `physics.test.js:407–409`.
**Proposed fix:** Optional — leave as a defensive guard, or delete lines 472–477. No functional effect either way. Listed for completeness; recommend **no change** unless you want it gone.
**Risk if unfixed:** None.

---
**FINDING-11** [HYGIENE]
**Location:** `src/App.jsx:477` (`noWakeError`), `:643` (`fa_noWakeError`)
**Summary:** Variable names say "no-wake" but the value is true for *any* stand-off violation.
**Detail:** `const noWakeError = standoffError !== null;` is set whether the user is in NO-WAKE mode or OPEN-SPACE mode with a custom stand-off. The inline comment ("keeps downstream compat") acknowledges the misnomer. Purely cosmetic.
**Proposed fix:** Optional rename to `standoffBlocked` / `fa_standoffBlocked` for accuracy. Low priority; flag only.
**Risk if unfixed:** None functional; mild reader confusion.

---
**FINDING-12** [DEAD + EDGE]
**Location:** `src/App.jsx:446` — distance unit ternary trailing `: 1`
**Summary:** The meters (`:1`) fallback for burn-mode distance is unreachable from the UI.
**Detail:** Burn-mode distance unit buttons offer only `['km','gm','au']` (line 874), so `distanceUnit` is never `'m'`/other; the `: 1` branch is dead via the UI. It *is* reachable by a crafted URL (`?du=m`), in which case distance is read as meters — harmless but undocumented.
**Proposed fix:** No change required; note for awareness. If desired, validate `distanceUnit` against the allowed set on load.
**Risk if unfixed:** Negligible.

---
**FINDING-13** [HYGIENE]
**Location:** `src/App.jsx:223` (`vcrsUnit` init from `_up('cu')` only) and `:283–299` (LS sync omits `vcrsUnit`)
**Summary:** `vcrsUnit` is the only unit toggle not persisted to localStorage.
**Detail:** Every other unit (`distanceUnit`, `v0Unit`, `vArrivalUnit`, FA equivalents) initializes via `_ul(url, ls, default)` and is written in the LS-sync effect. `vcrsUnit` initializes from URL only and is never saved to LS, so a chosen km/s preference does not survive a reload without the URL param.
**Proposed fix:** If consistency is desired, initialize `vcrsUnit` with `_ul('cu', 'pa_cu', 'm/s')` and add `_lsSave('pa_cu', vcrsUnit !== 'm/s' ? vcrsUnit : null)` to the LS effect. (Confirm this is wanted — per-burn fields are intentionally URL-only, but *unit toggles* are treated as preferences elsewhere.)
**Risk if unfixed:** Minor inconsistency in remembered preferences.

---
**FINDING-14** [EDGE]
**Location:** `src/App.jsx:1576–1583` (Min Reactant Budget readout)
**Summary:** Missing `?? '0S'` fallback can render an empty value.
**Detail:** `value={formatTargetDuration(Math.floor((finalPlan.t_accel||0)+(finalPlan.t_brake||0)))}`. `formatTargetDuration` returns `null` for `≤ 0`; if the floored thrust-seconds total is 0 (a degenerate near-instant burn), the readout renders empty rather than `0S`. Every other `formatTargetDuration` readout in the file uses `?? '0S'`.
**Proposed fix:** Append `?? '0S'` to match the sibling readouts.
**Risk if unfixed:** Rare empty field; cosmetic.

---
**FINDING-15** [EDGE]
**Location:** `src/App.jsx:601–618` (`fa_required_a_computed` / `fa_a_mps2`) → `:659` (`computeFinalApproach`)
**Summary:** In FA constant-burn (blank accel) with `v_arrival ≥ v0`, the user sees a generic "MISSING OR INVALID INPUT" instead of the specific cutoff-velocity error.
**Detail:** When `faAccelBlank` and `fa_v_arrival_mps ≥ fa_v0_mps`, `fa_required_a_computed` is `null` → `fa_a_mps2` is `NaN`. `computeFinalApproach` then hits its `!every(isFinite)` guard first and returns `MISSING OR INVALID INPUT`, masking the more accurate `CUTOFF VELOCITY MUST BE LESS THAN CURRENT VREL` message that fires when an explicit accel is supplied.
**Proposed fix:** Optional — when `faAccelBlank` and `fa_v_arrival_mps ≥ fa_v0_mps`, surface the cutoff-velocity message directly (or compute `required_a` independent of the accel field). Low priority.
**Risk if unfixed:** Slightly misleading error text in one narrow FA input combination.

---
**FINDING-16** [PERF]
**Location:** `src/App.jsx` component body (all derived calcs) and `:718–729` (flicker effect `JSON.stringify`)
**Summary:** No memoization; all plan math + a `JSON.stringify` run on every render.
**Detail:** `computePlan`, `computeFinalApproach`, `solveAcceleration`, `buildDriftPlan`, and the FA chain re-run on every keystroke/render, and the flicker effect builds a JSON key each render. The work is microscopic (a handful of arithmetic ops) and React batches input renders, so real-world impact is nil.
**Proposed fix:** No action recommended. (If ever needed, wrap the solve block in `useMemo` keyed on the SI inputs.) Listed only to confirm the hot path was examined.
**Risk if unfixed:** None at current scale.

---
**FINDING-17** [EDGE + HYGIENE]
**Location:** `src/physics.js:85` / `:95–106` (`parseTargetDuration` numeric groups `[\d.]+`)
**Summary:** Malformed multi-decimal tokens are accepted (e.g. `'4.5.5d' → 4.5 days`).
**Detail:** The `[\d.]+` capture swallows `4.5.5`, and `parseFloat('4.5.5') = 4.5`; the remainder check then passes because the whole token was consumed. Garbage like `4.5.5d` yields a (wrong-but-finite) duration instead of `null`. Audit OPEN QUESTION 3. The produced value is itself computed correctly for the truncated `4.5d`.
**Proposed fix (DECISION — see DECISIONS #2):** Tighten the numeric groups to a single-decimal pattern (`\d+(?:\.\d+)?`) and reject leftover decimals, or accept the leniency as-is.
**Risk if unfixed:** A typo silently parses to a plausible-looking wrong duration.

---
**FINDING-18** [EDGE]
**Location:** `src/physics.js:21` (`parseNum` regex) — affects all numeric inputs
**Summary:** Scientific notation (`1e6`) is rejected as invalid.
**Detail:** `^[+-]?(\d+\.?\d*|\.\d+)$` does not permit an exponent, so `1e6` in any distance/velocity field is treated as non-numeric → "missing/invalid input". This is consistent strict behavior, but a user accustomed to `1e6` may be surprised.
**Proposed fix:** No change unless you want to support exponents (would require extending the regex and re-checking `parseGValue`/comma handling). Likely **no-action**; documented per the checklist.
**Risk if unfixed:** Minor user surprise; no wrong output.

---
**FINDING-19** [HYGIENE]
**Location:** `src/App.jsx:585` (`highVcrsWarning`)
**Summary:** Name no longer matches meaning after the severity rework.
**Detail:** `highVcrsWarning` now means "VCRS null time exceeds 10% of approach time," not "VCRS magnitude is high." The name is a mild leftover from the old flat-threshold design.
**Proposed fix:** Optional rename (e.g. `vcrsAdvisory` / `showVcrsWarning`). Cosmetic.
**Risk if unfixed:** None functional.

---
**FINDING-20** [COVERAGE]
**Location:** `src/physics.test.js` — `addGameTime` / `formatTargetDuration` calendar edges
**Summary:** Fractional-`DAY` calendar edges are only lightly covered.
**Detail:** `addGameTime` covers single day/month/year rollovers; it does not cover multi-month accumulation or a date crossing several months in one offset (now relevant with fixed 30-day months). `formatTargetDuration` covers `1D 40M` (the fractional-DAY boundary) but not a multi-day duration with a trailing partial second.
**Proposed fix:** Add an `addGameTime` test advancing a dated base by, say, `95 * DAY` and asserting the month/year landing; add a `formatTargetDuration` multi-day case.
**Risk if unfixed:** Low — core rollover is covered; deep accumulation is not.

---

## COVERAGE GAPS

| Exported (`physics.js`) | Happy path | Edge cases | Error cases | Round-trip |
|---|---|---|---|---|
| `parseNum` | COVERED | COVERED (commas, neg, multi-dot) | COVERED | — |
| `parseGValue` | COVERED | COVERED (`ggg`) | COVERED | — |
| `parseGameTime` | COVERED | COVERED (Feb 30 / day 31 / ≥DAY) | COVERED | — |
| `daysInMonth` | COVERED (fixed 30) | COVERED | — | — |
| `parseTargetDuration` | COVERED | PARTIAL (multi-decimal `4.5.5d` untested — FINDING-17) | COVERED | — |
| `formatTime` | COVERED | COVERED (neg/Inf/0) | COVERED | — |
| `formatDistance` | COVERED | PARTIAL (no negative) | COVERED (NaN) | — |
| `formatVelocity` | COVERED | PARTIAL (no negative) | COVERED (NaN) | — |
| `addGameTime` | COVERED | PARTIAL (multi-month accumulation — FINDING-20) | COVERED (null base) | — |
| `formatGameTime` | COVERED | COVERED (dayOffset) | COVERED (null) | — |
| `formatTargetDuration` | COVERED | PARTIAL (multi-day trailing partial — FINDING-20) | COVERED (0/neg) | — |
| `computePlan` | COVERED | PARTIAL (**no receding v0** — FINDING-8; flip_now weak — FINDING-9) | COVERED | via solveAcceleration |
| `computeFinalApproach` | COVERED | COVERED (overshoot, cutoff≥v0) | COVERED | — |
| `solveAcceleration` | COVERED | COVERED (short duration, huge a) | COVERED | COVERED |
| `buildDriftPlan` | **MISSING** | **MISSING** | **MISSING** | **MISSING** (FINDING-7) |

Constants `G`, `DAY`, `NO_WAKE_M` are asserted; `AU` is not directly asserted (low value).

---

## DECISIONS NEEDED

1. **FINDING-4 — invalid-VCRS contradictory state.** Which behavior do you want?
   - **(a, recommended)** VCRS is non-blocking: drop it from `burnMissingFields` so an invalid VCRS just suppresses the advisory and the burn plan still renders.
   - **(b)** VCRS stays required: add `burnMissingFields.length === 0` to `planValid` so results are withheld until VCRS parses.
   *No DLL lookup helps here — it is a UX policy call.*

2. **FINDING-17 — `parseTargetDuration` multi-decimal leniency.** Reject `4.5.5d` (tighten regex) or keep the lenient truncation? *UX/validation policy; no DLL input needed.*

3. **FINDING-13 — persist `vcrsUnit` to localStorage?** Make it consistent with the other unit toggles, or intentionally leave it URL-only? *Preference call.*

4. **FINDING-18 — accept scientific notation (`1e6`) in numeric fields?** Currently rejected. Keep strict, or broaden the parser? *Preference call.*

5. **FINDING-10 — delete the unreachable `disc < 0` branch in `solveAcceleration`, or keep it as a defensive guard?** *No functional impact either way.*

---

## NO-ACTION ITEMS (examined, confirmed correct/intentional)

- **All core solvers** (`computePlan`, `computeFinalApproach`, `solveAcceleration`, `buildDriftPlan`, the budget/drift `v_max` derivation) — math trusted per the completed audit; spot logic re-read, no discrepancies.
- **VCRS handling post-fix** — burn distance correctly uses straight-line range; the severity-based two-tier advisory and the 90°/270° null heading match `CLAUDE.md` and the in-game-confirmed convention.
- **Signed-`v0` convention**, stand-off subtraction, 0.01 G floor (entered + computed, both modes), overshoot gating — all consistent across Burn Plan and Final Approach.
- **Boundary handling** — `distance == standoff` (blocked), `v0 == v_arrival` (quadratic path), `budget == required` (treated as sufficient), zero/negative/whitespace inputs — all handled and surfaced sensibly.
- **`handleBurnCopy` / `handleFaCopy`** — reference `const`s declared later in the component, but are only invoked via `onClick` after render, so the closures are safe (no temporal-dead-zone hazard).
- **Boot sequence / URL+LS persistence / mode-switch field copying / flicker effect** — effect dependency arrays are correct; no infinite-loop or stale-state hazards found; `booting` guard makes the boot effect a no-op after first run.
- **`ErrorBoundary`, PWA/workbox config, font preconnect, `index.html` base path** — consistent with the `/torch-burn-computer/` base.
- **Game-mechanic constants** (GM, NO_WAKE_M, accel-in-G, reactant model, fixed-30-day calendar, `DAY`, `AU`) — match `DLL_RESULTS.MD`.

---

*End of report. No code has been changed. Awaiting sign-off on the findings and DECISIONS above before implementing anything.*
