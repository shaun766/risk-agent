import { describe, expect, it } from 'vitest';
import { buildSnapshot, detectSpendingAnomalies } from '../src';
import { makeContext, type TxnSpec } from './fixtures';

function anomaliesFor(extra: TxnSpec[]) {
  const routine: TxnSpec[] = [];
  // Twelve months of steady ₹800-ish dining so there is a real distribution.
  for (let month = -3; month <= 0; month += 1) {
    for (const day of [3, 7, 12, 18, 24]) {
      routine.push({ amount: 800 + day * 5, categoryKey: 'dining', day, monthOffset: month, merchantName: 'Local Cafe' });
    }
  }
  const ctx = makeContext({
    transactions: [{ amount: 75_000, categoryKey: 'salary', day: 1 }, ...routine, ...extra],
    priorMonths: [
      { income: 75_000, essential: 30_000, discretionary: 12_000, savings: 15_000 },
      { income: 75_000, essential: 30_000, discretionary: 12_000, savings: 15_000 },
    ],
  });
  const { snapshot, internals } = buildSnapshot(ctx);
  return detectSpendingAnomalies(ctx, snapshot, internals);
}

describe('anomaly detection', () => {
  it('flags an amount far outside the category distribution', () => {
    const found = anomaliesFor([
      { amount: 45_000, categoryKey: 'dining', day: 14, merchantName: 'Local Cafe' },
    ]);
    const outlier = found.find((a) => a.type === 'AMOUNT_OUTLIER');
    expect(outlier).toBeDefined();
    expect(outlier?.amount).toBe(45_000);
    expect(outlier?.detail).toMatch(/standard deviations/);
  });

  it('flags a first-time merchant taking a large share of income', () => {
    const found = anomaliesFor([
      { amount: 20_000, categoryKey: 'shopping', day: 14, merchantName: 'Unknown Electronics' },
    ]);
    expect(found.some((a) => a.type === 'NEW_MERCHANT_HIGH_VALUE')).toBe(true);
  });

  it('flags rapid repeat charges at one merchant', () => {
    const found = anomaliesFor([
      { amount: 2_000, categoryKey: 'shopping', day: 14, merchantName: 'Fast Retail' },
      { amount: 2_100, categoryKey: 'shopping', day: 14, merchantName: 'Fast Retail' },
      { amount: 2_200, categoryKey: 'shopping', day: 14, merchantName: 'Fast Retail' },
      { amount: 2_300, categoryKey: 'shopping', day: 14, merchantName: 'Fast Retail' },
    ]);
    expect(found.some((a) => a.type === 'VELOCITY')).toBe(true);
  });

  it('stays silent on steady, ordinary spending', () => {
    const found = anomaliesFor([]);
    expect(found.filter((a) => a.type === 'AMOUNT_OUTLIER')).toHaveLength(0);
    expect(found.filter((a) => a.type === 'VELOCITY')).toHaveLength(0);
  });

  it('needs a minimum history before reporting anything', () => {
    const ctx = makeContext({
      priorMonths: [],
      transactions: [
        { amount: 75_000, categoryKey: 'salary', day: 1 },
        { amount: 60_000, categoryKey: 'shopping', day: 5, merchantName: 'Anywhere' },
      ],
    });
    const { snapshot, internals } = buildSnapshot(ctx);
    expect(detectSpendingAnomalies(ctx, snapshot, internals)).toHaveLength(0);
  });
});
