/**
 * Money primitives.
 *
 * Every monetary value inside the financial engine is an integer number of
 * MINOR units (paise for INR). Floating point rupees are only ever produced at
 * the outer boundary, once, by `fromMinor`. This keeps all arithmetic exact and
 * removes the classic `0.1 + 0.2` class of bug from financial calculations.
 */

/** Integer minor units (paise). Branded so it cannot be confused with rupees. */
export type Minor = number & { readonly __brand: 'MinorUnits' };

export const MINOR_PER_MAJOR = 100;

export function toMinor(major: number | string): Minor {
  const value = typeof major === 'string' ? Number(major) : major;
  if (!Number.isFinite(value)) throw new TypeError(`toMinor: not a finite number: ${String(major)}`);
  // Round half away from zero so -0.005 -> -1 paise, 0.005 -> 1 paise.
  const scaled = value * MINOR_PER_MAJOR;
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  return rounded as Minor;
}

export function fromMinor(minor: Minor | number): number {
  return Math.round(minor) / MINOR_PER_MAJOR;
}

export function minor(value: number): Minor {
  return Math.round(value) as Minor;
}

export const ZERO = 0 as Minor;

export function addMinor(...values: Array<Minor | number>): Minor {
  return values.reduce<number>((acc, v) => acc + v, 0) as Minor;
}

export function subMinor(a: Minor | number, b: Minor | number): Minor {
  return (a - b) as Minor;
}

/** Multiply money by a plain ratio (e.g. 0.3 for 30%) and round to whole paise. */
export function mulMinor(a: Minor | number, ratio: number): Minor {
  return Math.round(a * ratio) as Minor;
}

export function maxMinor(...values: Array<Minor | number>): Minor {
  return Math.max(...values) as Minor;
}

export function minMinor(...values: Array<Minor | number>): Minor {
  return Math.min(...values) as Minor;
}

/** Never-negative clamp — used constantly for "remaining budget" style values. */
export function clampNonNegative(value: Minor | number): Minor {
  return (value < 0 ? 0 : value) as Minor;
}

/**
 * Safe ratio. Returns `fallback` when the denominator is zero so that a user
 * with no income never produces NaN/Infinity in a score.
 */
export function safeRatio(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator || !Number.isFinite(denominator)) return fallback;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

/** Round a non-money float (percentages, scores, months) to `dp` decimals. */
export function round(value: number, dp = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** dp;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** 0..1 -> 0..100, rounded to 2dp. */
export function toPercent(ratio: number, dp = 2): number {
  return round(clamp(ratio, -1e6, 1e6) * 100, dp);
}

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const INR_PRECISE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format major units (rupees) for human display. */
export function formatINR(major: number, precise = false): string {
  return (precise ? INR_PRECISE : INR).format(Number.isFinite(major) ? major : 0);
}
