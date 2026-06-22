import { describe, it, expect } from 'vitest';
import {
  G,
  DAY,
  NO_WAKE_M,
  parseNum,
  parseGValue,
  parseGameTime,
  parseTargetDuration,
  formatTime,
  formatDistance,
  formatVelocity,
  formatTargetDuration,
  addGameTime,
  formatGameTime,
  daysInMonth,
  computePlan,
  computeFinalApproach,
  solveAcceleration,
  buildDriftPlan,
} from './physics.js';

// ───── constants ──────────────────────────────────────────────────────────

describe('constants', () => {
  it('G is standard gravity', () => expect(G).toBe(9.80665));
  it('DAY is 87658.125 seconds', () => expect(DAY).toBe(87658.125));
  it('NO_WAKE_M is 300 km', () => expect(NO_WAKE_M).toBe(300_000));
});

// ───── parseNum ───────────────────────────────────────────────────────────

describe('parseNum', () => {
  it('parses a plain integer', () => expect(parseNum('42')).toBe(42));
  it('parses a decimal', () => expect(parseNum('3.14')).toBe(3.14));
  it('strips thousands commas', () => expect(parseNum('1,200,000')).toBe(1_200_000));
  it('parses negative', () => expect(parseNum('-5.5')).toBe(-5.5));
  it('rejects trailing letters', () => expect(parseNum('12abc')).toBeNaN());
  it('rejects empty string', () => expect(parseNum('')).toBeNaN());
  it('rejects non-string', () => expect(parseNum(42)).toBeNaN());
  it('rejects multiple decimals', () => expect(parseNum('1.2.3')).toBeNaN());
});

// ───── parseGValue ────────────────────────────────────────────────────────

describe('parseGValue', () => {
  it('parses bare number and converts to m/s²', () => {
    expect(parseGValue('1')).toBeCloseTo(G);
  });
  it('parses g-suffix (lowercase)', () => {
    expect(parseGValue('2g')).toBeCloseTo(2 * G);
  });
  it('parses G-suffix (uppercase)', () => {
    expect(parseGValue('1.95G')).toBeCloseTo(1.95 * G);
  });
  it('handles multiple g suffixes gracefully', () => {
    expect(parseGValue('1ggg')).toBeCloseTo(G);
  });
  it('rejects empty string', () => expect(parseGValue('')).toBeNaN());
  it('rejects letters-only', () => expect(parseGValue('g')).toBeNaN());
  it('rejects null', () => expect(parseGValue(null)).toBeNaN());
});

// ───── parseGameTime ──────────────────────────────────────────────────────

describe('parseGameTime', () => {
  it('parses HH:MM:SS', () => {
    expect(parseGameTime('12:30:00')).toEqual({ date: null, seconds: 45000 });
  });
  it('parses H:MM:SS', () => {
    expect(parseGameTime('1:00:00')).toEqual({ date: null, seconds: 3600 });
  });
  it('parses full datetime YYYY-MM-DD HH:MM:SS', () => {
    const result = parseGameTime('2025-01-15 06:00:00');
    expect(result).not.toBeNull();
    expect(result.date).toEqual({ y: 2025, mo: 1, d: 15 });
    expect(result.seconds).toBe(21600);
  });
  it('rejects bare HH:MM', () => expect(parseGameTime('12:30')).toBeNull());
  it('rejects empty string', () => expect(parseGameTime('')).toBeNull());
  it('rejects time ≥ DAY', () => expect(parseGameTime('24:21:00')).toBeNull());
  it('rejects invalid month 13', () => expect(parseGameTime('2025-13-01 00:00:00')).toBeNull());
  it('rejects invalid day 0', () => expect(parseGameTime('2025-01-00 00:00:00')).toBeNull());
  it('accepts Feb 30 (fixed 30-day months)', () =>
    expect(parseGameTime('2025-02-30 00:00:00')).not.toBeNull());
  it('rejects day 31', () => expect(parseGameTime('2025-02-31 00:00:00')).toBeNull());
  it('accepts 00:00:00', () => {
    expect(parseGameTime('00:00:00')).toEqual({ date: null, seconds: 0 });
  });
  it('rejects seconds > 59', () => expect(parseGameTime('01:00:60')).toBeNull());
});

// ───── parseTargetDuration ────────────────────────────────────────────────

describe('parseTargetDuration', () => {
  it('parses "4d 3h 2m 37s"', () => {
    expect(parseTargetDuration('4d 3h 2m 37s')).toBe(4 * DAY + 3 * 3600 + 2 * 60 + 37);
  });
  it('parses HH:MM:SS', () => {
    expect(parseTargetDuration('01:30:00')).toBe(5400);
  });
  it('parses H:MM:SS', () => {
    expect(parseTargetDuration('1:30:00')).toBe(5400);
  });
  it('parses bare seconds', () => {
    expect(parseTargetDuration('3600')).toBe(3600);
  });
  it('parses "3h 30m"', () => {
    expect(parseTargetDuration('3h 30m')).toBe(3 * 3600 + 1800);
  });
  it('parses "1d"', () => {
    expect(parseTargetDuration('1d')).toBe(DAY);
  });
  it('parses fractional days', () =>
    expect(parseTargetDuration('4.5d')).toBe(Math.round(4.5 * DAY * 1000) / 1000));
  it('parses fractional minutes', () => expect(parseTargetDuration('3.5m')).toBe(210));
  it('parses fractional days combined with other units', () =>
    expect(parseTargetDuration('1.5d 2h')).toBe(Math.round((1.5 * DAY + 2 * 3600) * 1000) / 1000));
  it('rejects empty', () => expect(parseTargetDuration('')).toBeNull());
  it('rejects zero', () => expect(parseTargetDuration('0')).toBeNull());
  it('rejects trailing garbage digits after a unit token', () =>
    expect(parseTargetDuration('5h555555')).toBeNull());
  it('rejects embedded non-numeric garbage', () =>
    expect(parseTargetDuration('5habc')).toBeNull());
  it('still parses concatenated h+s tokens with no separator', () =>
    expect(parseTargetDuration('5h5s')).toBe(5 * 3600 + 5));
});

// ───── formatTime ─────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('formats sub-hour as M:SS', () => expect(formatTime(90)).toBe('1:30'));
  it('formats exactly 1 hour', () => expect(formatTime(3600)).toBe('1:00:00'));
  it('formats 1h 23m 45s', () => expect(formatTime(5025)).toBe('1:23:45'));
  it('returns — for negative', () => expect(formatTime(-1)).toBe('—'));
  it('returns — for Infinity', () => expect(formatTime(Infinity)).toBe('—'));
  it('handles 0 as 0:00', () => expect(formatTime(0)).toBe('0:00'));
});

// ───── formatDistance ─────────────────────────────────────────────────────

describe('formatDistance', () => {
  it('formats meters below 1000', () => expect(formatDistance(500)).toBe('500 m'));
  it('formats km', () => expect(formatDistance(1500)).toBe('1.5 km'));
  it('formats large km with commas', () => expect(formatDistance(1_500_000)).toMatch(/km/));
  it('returns — for NaN', () => expect(formatDistance(NaN)).toBe('—'));
});

// ───── formatVelocity ─────────────────────────────────────────────────────

describe('formatVelocity', () => {
  it('formats m/s below 1000', () => expect(formatVelocity(500)).toBe('500.0 m/s'));
  it('formats km/s at 1000', () => expect(formatVelocity(1000)).toBe('1.00 km/s'));
  it('returns — for NaN', () => expect(formatVelocity(NaN)).toBe('—'));
});

// ───── formatTargetDuration ───────────────────────────────────────────────

describe('formatTargetDuration', () => {
  it('formats 90s as 1M 30S', () => expect(formatTargetDuration(90)).toBe('1M 30S'));
  it('formats exactly 1h as 1H', () => expect(formatTargetDuration(3600)).toBe('1H'));
  it('formats 1h 1m 1s', () => expect(formatTargetDuration(3661)).toBe('1H 1M 1S'));
  it('suppresses leading/trailing zero components', () => {
    // 1 day + 40 minutes
    expect(formatTargetDuration(DAY + 40 * 60)).toBe('1D 40M');
  });
  it('formats a multi-day duration with a trailing partial second', () => {
    // 2 days + 3 hours + 47.6 s → minutes component is zero (suppressed)
    expect(formatTargetDuration(2 * DAY + 3 * 3600 + 47.6)).toBe('2D 3H 47S');
  });
  it('returns null for 0', () => expect(formatTargetDuration(0)).toBeNull());
  it('returns null for negative', () => expect(formatTargetDuration(-1)).toBeNull());
});

// ───── daysInMonth ────────────────────────────────────────────────────────

describe('daysInMonth', () => {
  it('January has 30 days (fixed-length game month)', () => expect(daysInMonth(1, 2025)).toBe(30));
  it('February has 30 days (no leap years)', () => expect(daysInMonth(2, 2024)).toBe(30));
  it('February non-leap has 30 days', () => expect(daysInMonth(2, 2025)).toBe(30));
  it('April has 30 days', () => expect(daysInMonth(4, 2025)).toBe(30));
});

// ───── addGameTime ────────────────────────────────────────────────────────

describe('addGameTime', () => {
  it('adds seconds within same day (time-only)', () => {
    const base = { date: null, seconds: 3600 };
    const result = addGameTime(base, 3600);
    expect(result.timeStr).toBe('02:00:00');
    expect(result.hasDate).toBe(false);
  });

  it('adds offset with date, no day rollover', () => {
    const base = { date: { y: 2025, mo: 1, d: 15 }, seconds: 0 };
    const result = addGameTime(base, 7200);
    expect(result.timeStr).toBe('02:00:00');
    expect(result.dateStr).toBe('2025-01-15');
  });

  it('rolls over to next day', () => {
    const base = { date: { y: 2025, mo: 1, d: 15 }, seconds: DAY - 1 };
    const result = addGameTime(base, 2);
    expect(result.timeStr).toBe('00:00:01');
    expect(result.dateStr).toBe('2025-01-16');
  });

  it('rolls over month boundary', () => {
    const base = { date: { y: 2025, mo: 1, d: 31 }, seconds: 0 };
    const result = addGameTime(base, DAY);
    expect(result.dateStr).toBe('2025-02-01');
  });

  it('rolls over year boundary', () => {
    const base = { date: { y: 2024, mo: 12, d: 31 }, seconds: 0 };
    const result = addGameTime(base, DAY);
    expect(result.dateStr).toBe('2025-01-01');
  });

  it('accumulates across multiple 30-day months', () => {
    // Jan 15 + 95 days, fixed 30-day months: day-of-year 15 + 95 = 110 → month 4, day 20
    const base = { date: { y: 2025, mo: 1, d: 15 }, seconds: 0 };
    const result = addGameTime(base, 95 * DAY);
    expect(result.dateStr).toBe('2025-04-20');
  });

  it('returns null for null base', () => {
    expect(addGameTime(null, 100)).toBeNull();
  });

  it('wraps a time-only offset past the day boundary and reports day offset', () => {
    const base = { date: null, seconds: 87132 }; // 24:12:12
    const result = addGameTime(base, 123581); // ~34h19m41s later
    expect(result.timeStr).toBe('09:49:56');
    expect(result.hasDate).toBe(false);
    expect(result.dayOffset).toBe(2);
  });

  it('reports dayOffset 0 when time-only offset stays within the same day', () => {
    const base = { date: null, seconds: 3600 };
    const result = addGameTime(base, 3600);
    expect(result.dayOffset).toBe(0);
  });
});

// ───── formatGameTime ─────────────────────────────────────────────────────

describe('formatGameTime', () => {
  it('formats time-only result', () => {
    const parsed = { dateStr: null, timeStr: '14:30:00', hasDate: false };
    expect(formatGameTime(parsed)).toBe('14:30:00');
  });

  it('formats date+time result', () => {
    const parsed = { dateStr: '2025-01-15', timeStr: '06:00:00', hasDate: true };
    expect(formatGameTime(parsed)).toBe('2025-01-15 06:00:00');
  });

  it('returns null for null input', () => {
    expect(formatGameTime(null)).toBeNull();
  });

  it('prefixes day offset when time-only result has rolled over', () => {
    const parsed = { dateStr: null, timeStr: '09:49:55', hasDate: false, dayOffset: 2 };
    expect(formatGameTime(parsed)).toBe('T+2D 09:49:55');
  });

  it('omits day prefix when time-only result has no rollover', () => {
    const parsed = { dateStr: null, timeStr: '02:00:00', hasDate: false, dayOffset: 0 };
    expect(formatGameTime(parsed)).toBe('02:00:00');
  });
});

// ───── computePlan ────────────────────────────────────────────────────────

describe('computePlan', () => {
  const base = {
    distance_m: 1_000_000,
    v0_mps: 500,
    a_mps2: 2 * G,
    v_arrival_mps: 0,
    t_rotate_s: 60,
  };

  it('returns a valid plan for a typical burn', () => {
    const result = computePlan(base);
    expect(result.error).toBeUndefined();
    expect(result.t_total).toBeGreaterThan(0);
    expect(result.v_max).toBeGreaterThan(base.v0_mps);
  });

  it('distance conservation: d_accel + d_coast + d_brake ≈ distance_m', () => {
    const result = computePlan(base);
    expect(result.d_accel + result.d_coast + result.d_brake).toBeCloseTo(base.distance_m, 0);
  });

  it('returns error for missing fields', () => {
    const result = computePlan({ ...base, distance_m: NaN });
    expect(result.error).toBe('MISSING OR INVALID INPUT');
  });

  it('returns error for zero acceleration', () => {
    const result = computePlan({ ...base, a_mps2: 0 });
    expect(result.error).toBe('ACCELERATION MUST BE POSITIVE');
  });

  it('returns error for zero distance', () => {
    const result = computePlan({ ...base, distance_m: 0 });
    expect(result.error).toBe('BURN DISTANCE IS ZERO OR NEGATIVE');
  });

  it('returns overshoot when distance is too short to brake', () => {
    const result = computePlan({ ...base, distance_m: 100 });
    expect(result.overshoot).toBe(true);
    expect(result.shortfall).toBeGreaterThan(0);
  });

  it('returns flip_now when already at the optimal flip point', () => {
    // At distance == brake-only distance, v_max == v0 exactly, so no accel phase
    // is needed and the burn must flip immediately.
    const v0 = 1000;
    const a = 2 * G;
    const t_rot = 60;
    const brakeOnly = v0 * t_rot + (v0 * v0) / (2 * a);
    const result = computePlan({
      distance_m: brakeOnly,
      v0_mps: v0,
      a_mps2: a,
      v_arrival_mps: 0,
      t_rotate_s: t_rot,
    });
    expect(result.flip_now).toBe(true);
    expect(result.t_accel).toBe(0);
    expect(result.t_brake).toBeGreaterThan(0);
  });

  it('handles a receding (negative v0) burn', () => {
    const params = {
      distance_m: 2_000_000,
      v0_mps: -300,
      a_mps2: 2 * G,
      v_arrival_mps: 0,
      t_rotate_s: 60,
    };
    const result = computePlan(params);
    expect(result.error).toBeUndefined();
    expect(result.overshoot).toBeUndefined();
    expect(result.v_max).toBeGreaterThan(0);
    // Distance conservation (d_coast is the flip-coast distance)
    expect(result.d_accel + result.d_coast + result.d_brake).toBeCloseTo(params.distance_m, 0);
    // Receding penalty: accel phase is longer than the equivalent closing burn
    const closing = computePlan({ ...params, v0_mps: 300 });
    expect(result.t_accel).toBeGreaterThan(closing.t_accel);
  });
});

// ───── computeFinalApproach ───────────────────────────────────────────────

describe('computeFinalApproach', () => {
  const base = {
    distance_m: 200_000,
    v0_mps: 300,
    a_mps2: 2 * G,
    v_arrival_mps: 0,
  };

  it('returns a valid plan', () => {
    const result = computeFinalApproach(base);
    expect(result.error).toBeUndefined();
    expect(result.t_brake).toBeGreaterThan(0);
  });

  it('total distance = d_coast + d_brake', () => {
    const result = computeFinalApproach(base);
    expect(result.d_coast + result.d_brake).toBeCloseTo(base.distance_m, 0);
  });

  it('returns error for non-positive closing velocity', () => {
    const result = computeFinalApproach({ ...base, v0_mps: 0 });
    expect(result.error).toBe('CLOSING VELOCITY MUST BE POSITIVE');
  });

  it('returns overshoot when brake distance > range', () => {
    const result = computeFinalApproach({ ...base, distance_m: 100 });
    expect(result.overshoot).toBe(true);
  });

  it('returns error when arrival speed ≥ closing speed', () => {
    const result = computeFinalApproach({ ...base, v_arrival_mps: 300 });
    expect(result.error).toContain('CUTOFF VELOCITY MUST BE LESS THAN');
  });
});

// ───── solveAcceleration ──────────────────────────────────────────────────

describe('solveAcceleration', () => {
  // Reference: we know a burn of these params takes t_total from computePlan.
  // solveAcceleration should recover the original acceleration when given that t_total.
  it('round-trips with computePlan', () => {
    const params = {
      distance_m: 1_000_000,
      v0_mps: 500,
      a_mps2: 2 * G,
      v_arrival_mps: 0,
      t_rotate_s: 60,
    };
    const plan = computePlan(params);
    expect(plan.error).toBeUndefined();

    const solved = solveAcceleration({
      distance_m: params.distance_m,
      v0_mps: params.v0_mps,
      v_arrival_mps: params.v_arrival_mps,
      t_rotate_s: params.t_rotate_s,
      t_total_s: plan.t_total,
    });
    expect(solved.error).toBeUndefined();
    expect(solved.a_mps2).toBeCloseTo(params.a_mps2, 3);
  });

  it('returns error for missing fields', () => {
    const result = solveAcceleration({
      distance_m: NaN,
      v0_mps: 500,
      v_arrival_mps: 0,
      t_rotate_s: 60,
      t_total_s: 1000,
    });
    expect(result.error).toBe('MISSING OR INVALID INPUT');
  });

  it('returns error when duration shorter than flip time', () => {
    const result = solveAcceleration({
      distance_m: 1_000_000,
      v0_mps: 500,
      v_arrival_mps: 0,
      t_rotate_s: 200,
      t_total_s: 100,
    });
    expect(result.error).toBe('DURATION TOO SHORT');
  });

  it('returns a large acceleration for extremely short target time', () => {
    // C_coeff = -(v0-v_arrival)² ≤ 0 always, so disc ≥ 0 always — solver never returns
    // NO SOLUTION EXISTS. A very short t_total for a large distance just yields huge a_mps2.
    const result = solveAcceleration({
      distance_m: 1e12,
      v0_mps: 1,
      v_arrival_mps: 0,
      t_rotate_s: 0,
      t_total_s: 1,
    });
    expect(result.error).toBeUndefined();
    expect(result.a_mps2).toBeGreaterThan(0);
  });
});

// ───── buildDriftPlan ─────────────────────────────────────────────────────

describe('buildDriftPlan', () => {
  const base = {
    distance_m: 2_000_000,
    v0_mps: 500,
    a_mps2: 2 * G,
    v_arrival_mps: 0,
    t_rotate_s: 60,
  };

  it('returns a valid drift plan whose phase distances sum to distance_m', () => {
    const result = buildDriftPlan({ ...base, v_max: 2000 });
    expect(result).not.toBeNull();
    expect(result.t_drift).toBeGreaterThan(0);
    const d_flip = result.v_max * result.t_rotate;
    expect(result.d_accel + d_flip + result.d_drift + result.d_brake).toBeCloseTo(
      base.distance_m,
      0
    );
  });

  it('returns null when v_max leaves no room for a drift phase', () => {
    const result = buildDriftPlan({ ...base, distance_m: 100_000, v_max: 10_000 });
    expect(result).toBeNull();
  });

  it('clamps drift to zero at the standard (no-drift) peak velocity', () => {
    // The computePlan peak velocity exactly fills accel+flip+brake, leaving zero drift.
    const std = computePlan(base);
    const result = buildDriftPlan({ ...base, v_max: std.v_max });
    expect(result).not.toBeNull();
    expect(result.t_drift).toBeCloseTo(0, 5);
    expect(result.d_drift).toBeCloseTo(0, 0);
  });
});
