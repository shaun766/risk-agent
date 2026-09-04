import { describe, expect, it } from 'vitest';
import { PurchaseVerdict } from '@flowmoney/shared-types';
import {
  buildMonthlyReport,
  buildSnapshot,
  computeBudgetStatus,
  computeFinancialHealth,
} from '../src';
import { healthyContext } from './fixtures';

function reportFor() {
  const ctx = healthyContext();
  const { snapshot, internals } = buildSnapshot(ctx);
  const health = computeFinancialHealth(snapshot, internals);
  const budgetStatus = computeBudgetStatus(ctx, snapshot, internals);
  return buildMonthlyReport({
    ctx,
    snapshot,
    internals,
    health,
    budgetStatus,
    healthTrend: [
      { month: '2026-01', score: 61 },
      { month: '2026-02', score: 66 },
    ],
    purchaseDecisions: [
      {
        description: 'Noise cancelling headphones',
        price: 18_000,
        verdict: PurchaseVerdict.WAIT_AND_SAVE,
        score: 54,
        createdAt: '2026-03-09T10:00:00.000Z',
      },
    ],
  });
}

describe('monthly report', () => {
  it('assembles every required section', () => {
    const report = reportFor();
    expect(report.month).toBe('2026-03');
    expect(report.overview.income).toBe(90_000);
    expect(report.overview.savings).toBe(25_000);
    expect(report.spendingBreakdown.length).toBeGreaterThan(0);
    expect(report.budgetPerformance).not.toBeNull();
    expect(report.health.score).toBeGreaterThan(0);
    expect(report.forecast.basis).toMatch(/pace/i);
    expect(report.purchaseDecisions).toHaveLength(1);
  });

  it('appends the current month to the health trend exactly once', () => {
    const report = reportFor();
    expect(report.healthTrend.map((t) => t.month)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('compares against the previous month when history exists', () => {
    const report = reportFor();
    expect(report.previousMonth).not.toBeNull();
    expect(report.previousMonth?.income).toBe(90_000);
  });

  it('ranks merchants and largest transactions by value', () => {
    const report = reportFor();
    const amounts = report.topMerchants.map((m) => m.amount);
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
    expect(report.largestTransactions[0]?.amount).toBeGreaterThanOrEqual(
      report.largestTransactions.at(-1)?.amount ?? 0,
    );
  });

  it('recommends closing an emergency fund gap with concrete numbers', () => {
    const report = reportFor();
    const recommendation = report.recommendations.find((r) => /emergency fund gap/i.test(r.title));
    expect(recommendation).toBeDefined();
    expect(recommendation?.impact).toBeGreaterThan(0);
  });
});
