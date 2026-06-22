export const G = 9.80665; // standard gravity, m/s²
export const AU = 149_597_870_000; // meters per astronomical unit (Ostranauts value)
// Game day: the true physical day length per the game DLL
// (MathUtils.GetDayOfYearFromS uses 87,658.125 s = 24h 20m 58.125s).
// The clock displays whole seconds, so the last displayed second is 24:20:58.
export const DAY = 87_658.125; // s
export const NO_WAKE_M = 300_000; // 300 km no-wake zone at destination

// ───── parsers ────────────────────────────────────────────────────────────

/**
 * Strict numeric parser. Strips thousands-separator commas; rejects non-numeric
 * trailing characters that parseFloat would swallow (e.g. "12abc" → NaN).
 * @param {string} str
 * @returns {number}
 */
export function parseNum(str) {
  if (typeof str !== 'string') return NaN;
  const s = str.trim().replace(/,/g, '');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return parseFloat(s);
}

/**
 * Acceleration parser. Accepts bare numbers ("1.95") or g-suffixed ("1.95g" / "1.95G").
 * Strips all trailing g/G characters before parsing so "1.95ggg" is handled gracefully.
 * @param {string} str
 * @returns {number} Value in m/s², or NaN on bad input.
 */
export function parseGValue(str) {
  if (!str || typeof str !== 'string') return NaN;
  const s = str.trim().replace(/,/g, '').replace(/g+$/i, '');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return parseFloat(s) * G;
}

/**
 * Parses a game clock string. Accepts full datetime "YYYY-MM-DD HH:MM:SS"
 * or strict time-only "HH:MM:SS". Bare "HH:MM" is intentionally rejected.
 * @param {string} timeStr
 * @returns {{ date: {y:number,mo:number,d:number}|null, seconds: number }|null}
 */
export function parseGameTime(timeStr) {
  if (!timeStr || !timeStr.trim()) return null;
  const str = timeStr.trim();
  // Try full datetime: YYYY-MM-DD HH:MM:SS
  const dtMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (dtMatch) {
    const [, y, mo, d, h, mi, s] = dtMatch.map(Number);
    const secs = h * 3600 + mi * 60 + s;
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(mo, y)) return null;
    if (mi > 59 || s > 59 || secs >= DAY) return null;
    return { date: { y, mo, d }, seconds: secs };
  }
  // Try time-only: HH:MM:SS (exactly, no partial segments)
  const timeMatch = str.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!timeMatch) return null;
  const [, h, mi, s] = timeMatch.map(Number);
  const secs = h * 3600 + mi * 60 + s;
  if (mi > 59 || s > 59 || secs >= DAY) return null;
  return { date: null, seconds: secs };
}

/**
 * Ostranauts months are a fixed 30 game-days each — no leap years, no variable
 * lengths (confirmed via Assembly-CSharp.dll: month = 2,629,743.75 s = 30 days).
 * @returns {number}
 */
export function daysInMonth() {
  return 30;
}

/**
 * Parses a mission duration string into seconds.
 * Accepts: "4d 3h 2m 37s", "4d 6:30:00", "HH:MM:SS", "H:MM:SS", "4d", "3h 30m", etc.
 * 1 day = DAY seconds (87,659 s — Ostranauts game day).
 * @param {string} str
 * @returns {number|null} Total seconds, or null on bad input.
 */
export function parseTargetDuration(str) {
  if (!str || !str.trim()) return null;
  const s = str.trim().toLowerCase();

  let total = 0;
  let matched = false;

  // Extract day component if present: e.g. "4d" (decimals allowed, e.g. "3.5d")
  const dayMatch = s.match(/(\d+(?:\.\d+)?)\s*d/);
  if (dayMatch) {
    total += parseFloat(dayMatch[1]) * DAY;
    matched = true;
  }

  // Extract h/m/s components if present: "3h", "2m", "37s" (decimals allowed, e.g. "39.09h")
  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*h/);
  const minMatch = s.match(/(\d+(?:\.\d+)?)\s*m(?!s)/); // 'm' not followed by 's' (avoid 'ms')
  const secMatch = s.match(/(\d+(?:\.\d+)?)\s*s/);
  if (hourMatch) {
    total += parseFloat(hourMatch[1]) * 3600;
    matched = true;
  }
  if (minMatch) {
    total += parseFloat(minMatch[1]) * 60;
    matched = true;
  }
  if (secMatch) {
    total += parseFloat(secMatch[1]);
    matched = true;
  }

  // Reject trailing/embedded garbage that the d/h/m/s patterns didn't consume,
  // e.g. "5h555555" would otherwise silently parse as just "5h".
  if (matched) {
    let remainder = s;
    if (dayMatch) remainder = remainder.replace(dayMatch[0], '');
    if (hourMatch) remainder = remainder.replace(hourMatch[0], '');
    if (minMatch) remainder = remainder.replace(minMatch[0], '');
    if (secMatch) remainder = remainder.replace(secMatch[0], '');
    if (remainder.trim() !== '') return null;
  }

  // If no d/h/m/s tokens found, try plain HH:MM:SS or HH:MM
  if (!matched) {
    const parts = s.split(':').map((p) => p.trim());
    if (parts.length >= 2 && parts.length <= 3) {
      const nums = parts.map(Number);
      if (
        nums.every((n) => isFinite(n) && n >= 0) &&
        nums[1] <= 59 &&
        (nums[2] === undefined || nums[2] <= 59)
      ) {
        total = nums[0] * 3600 + nums[1] * 60 + (nums[2] || 0);
        matched = true;
      }
    }
  }

  // Last resort: bare positive integer — treat as seconds
  if (!matched && /^\d+$/.test(s)) {
    const bare = parseInt(s, 10);
    if (bare > 0) {
      total = bare;
      matched = true;
    }
  }

  if (!matched || total <= 0) return null;
  return Math.round(total * 1000) / 1000;
}

// ───── formatters ─────────────────────────────────────────────────────────

/**
 * @param {number} seconds
 * @returns {string} e.g. "1:23:45" or "3:07"
 */
export function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * @param {number} meters
 * @returns {string} e.g. "1,234.56 km" or "987 m"
 */
export function formatDistance(meters) {
  if (!isFinite(meters)) return '—';
  if (Math.abs(meters) >= 1000) {
    return `${(meters / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} km`;
  }
  return `${meters.toFixed(0)} m`;
}

/**
 * @param {number} mps
 * @returns {string} e.g. "1.23 km/s" or "456.7 m/s"
 */
export function formatVelocity(mps) {
  if (!isFinite(mps)) return '—';
  if (Math.abs(mps) >= 1000) return `${(mps / 1000).toFixed(2)} km/s`;
  return `${mps.toFixed(1)} m/s`;
}

/**
 * Adds an offset to a parsed game-time base, rolling over day/month/year boundaries.
 * @param {{ date: {y:number,mo:number,d:number}|null, seconds: number }|null} base
 * @param {number} offsetSeconds
 * @returns {{ dateStr: string|null, timeStr: string, hasDate: boolean }|null}
 */
export function addGameTime(base, offsetSeconds) {
  if (base == null || !isFinite(offsetSeconds)) return null;
  // Keep the offset un-floored: DAY is fractional (87,658.125 s), so flooring a
  // one-day offset would drop it below DAY and skip the rollover. Output h/m/s
  // are floored below, so the displayed clock stays on whole seconds.
  let total = base.seconds + offsetSeconds;
  let datePart = base.date ? { ...base.date } : null;
  // Day rollover always runs, even with no calendar date, so time-only inputs
  // wrap at the DAY boundary instead of accumulating past 24h indefinitely.
  let dayOffset = 0;
  while (total >= DAY) {
    total -= DAY;
    dayOffset += 1;
    if (datePart) {
      datePart.d += 1;
      const dim = daysInMonth(datePart.mo, datePart.y);
      if (datePart.d > dim) {
        datePart.d = 1;
        datePart.mo += 1;
      }
      if (datePart.mo > 12) {
        datePart.mo = 1;
        datePart.y += 1;
      }
    }
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const dateStr = datePart
    ? `${datePart.y}-${String(datePart.mo).padStart(2, '0')}-${String(datePart.d).padStart(2, '0')}`
    : null;
  return { dateStr, timeStr, hasDate: !!datePart, dayOffset };
}

/**
 * @param {{ dateStr: string|null, timeStr: string, hasDate: boolean, dayOffset: number }|null} parsed
 * @returns {string|null}
 */
export function formatGameTime(parsed) {
  if (!parsed) return null;
  if (parsed.hasDate) return `${parsed.dateStr} ${parsed.timeStr}`;
  if (parsed.dayOffset > 0) return `T+${parsed.dayOffset}D ${parsed.timeStr}`;
  return parsed.timeStr;
}

/**
 * Formats a duration in seconds as a compact human-readable string,
 * suppressing all leading and trailing zero components.
 * e.g. 90 → "1M 30S", 3600 → "1H", 3661 → "1H 1M 1S", 90000 → "1D 40M"
 * @param {number} seconds
 * @returns {string|null}
 */
export function formatTargetDuration(seconds) {
  if (!isFinite(seconds) || seconds <= 0) return null;
  // DAY is fractional (87,658.125 s), so compute days from the raw value and
  // floor only the extracted components — pre-flooring the input against a
  // fractional DAY would shave whole minutes off clean day-plus offsets.
  const days = Math.floor(seconds / DAY);
  const rem = seconds - days * DAY;
  const h = Math.floor(rem / 3600);
  const m = Math.floor((rem % 3600) / 60);
  const sc = Math.floor(rem % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}D`);
  if (h > 0) parts.push(`${h}H`);
  if (m > 0) parts.push(`${m}M`);
  if (sc > 0) parts.push(`${sc}S`);
  return parts.length > 0 ? parts.join(' ') : '0S';
}

// ───── solvers ────────────────────────────────────────────────────────────

/**
 * Computes a flip-and-burn trajectory.
 * @param {{
 *   distance_m: number,
 *   v0_mps: number,
 *   a_mps2: number,
 *   v_arrival_mps: number,
 *   t_rotate_s: number
 * }} opts
 * @returns {{
 *   v_max: number, t_accel: number, t_rotate: number, t_brake: number,
 *   t_total: number, d_accel: number, d_coast: number, d_brake: number,
 *   flip_now?: boolean
 * } | { overshoot: true, brake_only_dist: number, shortfall: number, t_brake_full: number }
 *   | { error: string, detail: string }}
 */
export function computePlan({ distance_m, v0_mps, a_mps2, v_arrival_mps, t_rotate_s }) {
  if (![distance_m, v0_mps, a_mps2, v_arrival_mps, t_rotate_s].every(isFinite)) {
    return {
      error: 'MISSING OR INVALID INPUT',
      detail: 'One or more fields are empty or non-numeric.',
    };
  }
  if (a_mps2 <= 0)
    return {
      error: 'ACCELERATION MUST BE POSITIVE',
      detail: 'Enter a thrust value greater than zero.',
    };
  if (distance_m <= 0)
    return { error: 'BURN DISTANCE IS ZERO OR NEGATIVE', detail: 'Increase the total distance.' };
  if (v_arrival_mps < 0)
    return {
      error: 'CUTOFF VELOCITY CANNOT BE NEGATIVE',
      detail: 'Enter the desired speed at torch cutoff.',
    };
  if (t_rotate_s < 0)
    return {
      error: 'FLIP TIME CANNOT BE NEGATIVE',
      detail: 'Enter zero or a positive flip duration.',
    };

  // Overshoot is only possible when current speed already exceeds the desired arrival
  // speed (v0 > v_arrival) — that's the only regime where "brake only, no extra accel"
  // is a meaningful maneuver. When v0 <= v_arrival (always true for receding ships,
  // since v0 < 0 <= v_arrival), the ship needs to accelerate, not brake, and the
  // quadratic solve below handles that correctly.
  const brake_only_dist =
    v0_mps * t_rotate_s + (v0_mps * v0_mps - v_arrival_mps * v_arrival_mps) / (2 * a_mps2);

  if (v0_mps > v_arrival_mps && brake_only_dist > distance_m + 1e-6) {
    return {
      overshoot: true,
      brake_only_dist,
      shortfall: brake_only_dist - distance_m,
      t_brake_full: t_rotate_s + (v0_mps - v_arrival_mps) / a_mps2,
    };
  }

  const B = a_mps2 * t_rotate_s;
  const C = v0_mps * v0_mps + v_arrival_mps * v_arrival_mps + 2 * a_mps2 * distance_m;
  const v_max = (-B + Math.sqrt(B * B + 2 * C)) / 2;

  if (v_max <= v0_mps + 1e-6) {
    const t_brake = (v0_mps - v_arrival_mps) / a_mps2;
    return {
      flip_now: true,
      v_max: v0_mps,
      t_accel: 0,
      t_rotate: t_rotate_s,
      t_brake,
      t_total: t_rotate_s + t_brake,
      d_accel: 0,
      d_coast: v0_mps * t_rotate_s,
      d_brake: (v0_mps * v0_mps - v_arrival_mps * v_arrival_mps) / (2 * a_mps2),
    };
  }

  const t_accel = (v_max - v0_mps) / a_mps2;
  const t_brake = (v_max - v_arrival_mps) / a_mps2;
  return {
    v_max,
    t_accel,
    t_rotate: t_rotate_s,
    t_brake,
    t_total: t_accel + t_rotate_s + t_brake,
    d_accel: (v_max * v_max - v0_mps * v0_mps) / (2 * a_mps2),
    d_coast: v_max * t_rotate_s,
    d_brake: (v_max * v_max - v_arrival_mps * v_arrival_mps) / (2 * a_mps2),
  };
}

/**
 * Computes a constant-deceleration final approach.
 * @param {{
 *   distance_m: number,
 *   v0_mps: number,
 *   a_mps2: number,
 *   v_arrival_mps: number
 * }} opts
 * @returns {{
 *   t_brake: number, t_coast: number, d_brake: number, d_coast: number,
 *   required_a: number, t_total: number
 * } | { overshoot: true, d_brake_needed: number, shortfall: number, required_a: number, t_brake_if_max: number }
 *   | { error: string, detail: string }}
 */
export function computeFinalApproach({ distance_m, v0_mps, a_mps2, v_arrival_mps }) {
  if (![distance_m, v0_mps, a_mps2, v_arrival_mps].every(isFinite)) {
    return {
      error: 'MISSING OR INVALID INPUT',
      detail: 'One or more fields are empty or non-numeric.',
    };
  }
  if (a_mps2 <= 0)
    return {
      error: 'ACCELERATION MUST BE POSITIVE',
      detail: 'Enter a thrust value greater than zero.',
    };
  if (v0_mps <= 0)
    return {
      error: 'CLOSING VELOCITY MUST BE POSITIVE',
      detail: 'Enter a positive closing speed.',
    };
  if (distance_m <= 0)
    return { error: 'RANGE IS ZERO OR NEGATIVE', detail: 'Increase the distance to target.' };
  if (v_arrival_mps < 0)
    return {
      error: 'CUTOFF VELOCITY CANNOT BE NEGATIVE',
      detail: 'Enter the desired speed at torch cutoff.',
    };
  if (v_arrival_mps >= v0_mps)
    return {
      error: 'CUTOFF VELOCITY MUST BE LESS THAN CURRENT VREL',
      detail: 'You must be braking toward a lower speed.',
    };

  const d_brake_max = (v0_mps * v0_mps - v_arrival_mps * v_arrival_mps) / (2 * a_mps2);
  const t_brake_max = (v0_mps - v_arrival_mps) / a_mps2;
  const required_a = (v0_mps * v0_mps - v_arrival_mps * v_arrival_mps) / (2 * distance_m);

  if (d_brake_max > distance_m + 1e-6) {
    return {
      overshoot: true,
      d_brake_needed: d_brake_max,
      shortfall: d_brake_max - distance_m,
      required_a,
      t_brake_if_max: t_brake_max,
    };
  }

  const t_brake = t_brake_max;
  const d_coast = distance_m - d_brake_max;
  const t_coast = d_coast / v0_mps;

  return {
    t_brake,
    t_coast,
    d_brake: d_brake_max,
    d_coast,
    required_a,
    t_total: t_coast + t_brake,
  };
}

/**
 * Solves for the acceleration required to complete a burn in exactly t_total_s seconds.
 *
 * Derivation: substituting v_max = (a·T + S)/2 into the distance constraint yields
 * a quadratic in a: A·a² + B·a + C = 0
 * where T = t_total_s − t_rotate_s, S = v0_mps + v_arrival_mps.
 *
 * @param {{
 *   distance_m: number,
 *   v0_mps: number,
 *   v_arrival_mps: number,
 *   t_rotate_s: number,
 *   t_total_s: number
 * }} opts
 * @returns {{ a_mps2: number } | { error: string, detail: string }}
 */
export function solveAcceleration({ distance_m, v0_mps, v_arrival_mps, t_rotate_s, t_total_s }) {
  if (![distance_m, v0_mps, v_arrival_mps, t_rotate_s, t_total_s].every(isFinite)) {
    return {
      error: 'MISSING OR INVALID INPUT',
      detail: 'One or more fields are empty or non-numeric.',
    };
  }
  if (distance_m <= 0)
    return { error: 'BURN DISTANCE IS ZERO OR NEGATIVE', detail: 'Increase the total distance.' };
  if (v_arrival_mps < 0)
    return {
      error: 'CUTOFF VELOCITY CANNOT BE NEGATIVE',
      detail: 'Enter the desired speed at torch cutoff.',
    };
  if (t_total_s <= 0)
    return {
      error: 'TARGET DURATION MUST BE POSITIVE',
      detail: 'Enter a duration greater than zero.',
    };

  const T = t_total_s - t_rotate_s;
  if (T <= 0)
    return { error: 'DURATION TOO SHORT', detail: 'Target duration must exceed the flip time.' };

  const S = v0_mps + v_arrival_mps;
  const D = distance_m;

  const A_coeff = T * (T + 2 * t_rotate_s);
  const B_coeff = 2 * (S * (T + t_rotate_s) - 2 * D);
  const C_coeff = S * S - 2 * v0_mps * v0_mps - 2 * v_arrival_mps * v_arrival_mps;

  const disc = B_coeff * B_coeff - 4 * A_coeff * C_coeff;
  if (disc < 0)
    return {
      error: 'NO SOLUTION EXISTS',
      detail: 'The target duration is physically impossible for this distance and velocity.',
    };

  const r1 = (-B_coeff + Math.sqrt(disc)) / (2 * A_coeff);
  const r2 = (-B_coeff - Math.sqrt(disc)) / (2 * A_coeff);

  const candidates = [r1, r2].filter((r) => r > 1e-6); // must be meaningfully positive
  if (candidates.length === 0)
    return {
      error: 'NO POSITIVE SOLUTION',
      detail: 'The target duration is too long — no valid acceleration found.',
    };

  const a = Math.min(...candidates); // smallest positive root = minimum required acceleration
  return { a_mps2: a };
}

/**
 * Builds a complete drift-burn plan at a given peak velocity.
 * Flip distance is subtracted explicitly so the drift phase is the pure coast.
 *
 * @param {{ distance_m, v0_mps, a_mps2, v_arrival_mps, t_rotate_s, v_max }} opts
 * @returns {{ v_max, t_accel, t_rotate, t_drift, t_brake, t_total, d_accel, d_drift, d_brake } | null}
 */
export function buildDriftPlan({ distance_m, v0_mps, a_mps2, v_arrival_mps, t_rotate_s, v_max }) {
  const t_a = (v_max - v0_mps) / a_mps2;
  const t_b = (v_max - v_arrival_mps) / a_mps2;
  const d_a = (v_max * v_max - v0_mps * v0_mps) / (2 * a_mps2);
  const d_b = (v_max * v_max - v_arrival_mps * v_arrival_mps) / (2 * a_mps2);
  const d_f = v_max * t_rotate_s;
  const d_dr = distance_m - d_a - d_f - d_b;
  if (d_dr < -1) return null; // no room for a drift phase at this v_max
  const t_dr = Math.max(0, d_dr / v_max);
  return {
    v_max,
    t_accel: t_a,
    t_rotate: t_rotate_s,
    t_drift: t_dr,
    t_brake: t_b,
    t_total: t_a + t_rotate_s + t_dr + t_b,
    d_accel: d_a,
    d_drift: Math.max(0, d_dr),
    d_brake: d_b,
  };
}
