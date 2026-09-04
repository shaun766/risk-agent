import { describe, expect, it } from 'vitest';
import {
  PURCHASE_FACTOR_WEIGHTS,
  addMinor,
  clamp,
  fromMinor,
  mulMinor,
  round,
  safeRatio,
  toMinor,
  toPercent,
} from '@flowmoney/shared-types';

describe('money primitives', () => {
  it('converts rupees to exact paise without float drift', () => {
    expect(toMinor(0.1) + toMinor(0.2)).toBe(30);
    expect(fromMinor(addMinor(toMinor(0.1), toMinor(0.2)))).toBe(0.3);
  });

  it('rounds half away from zero in both directions', () => {
    expect(toMinor(0.005)).toBe(1);
    expect(toMinor(-0.005)).toBe(-1);
  });

  it('survives a long chain of additions that would drift in floats', () => {
    let float = 0;
    let exact = 0;
    for (let i = 0; i < 1000; i += 1) {
      float += 0.07;
      exact = addMinor(exact, toMinor(0.07));
    }
    expect(fromMinor(exact)).toBe(70);
    expect(float).not.toBe(70);
  });

  it('multiplies by a ratio and rounds to whole paise', () => {
    expect(mulMinor(toMinor(75_000), 0.3)).toBe(toMinor(22_500));
    expect(mulMinor(toMinor(100), 1 / 3)).toBe(3333);
  });

  it('never produces NaN or Infinity from a zero denominator', () => {
    expect(safeRatio(100, 0)).toBe(0);
    expect(safeRatio(100, 0, 1)).toBe(1);
    expect(toPercent(safeRatio(0, 0))).toBe(0);
    expect(round(Number.NaN)).toBe(0);
    expect(clamp(Number.NaN, 0, 100)).toBe(0);
  });
});

describe('policy constants', () => {
  it('purchase factor weights sum to exactly 1', () => {
    const total = Object.values(PURCHASE_FACTOR_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(round(total, 6)).toBe(1);
  });
});
