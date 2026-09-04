import { describe, expect, it } from 'vitest';
import { HEALTH_WEIGHTS, RiskLevel, round } from '@flowmoney/shared-types';
import { buildSnapshot, computeFinancialHealth, riskLevelForScore } from '../src';
import { healthyContext, makeContext, shaunContext } from './fixtures';

function healthFor(ctx: ReturnType<typeof makeContext>) {
  const { snapshot, internals } = buildSnapshot(ctx);
  return computeFinancialHealth(snapshot, internals);
}

describe('financial health score', () => {
  it('sums components to the total and respects the weighting', () => {
    const health = healthFor(healthyContext());
    const componentTotal = round(
      health.components.reduce((sum, c) => sum + c.score, 0),
      2,
    );
    expect(componentTotal).toBe(health.score);
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);

    const maxTotal = health.components.reduce((sum, c) => sum + c.maxScore, 0);
    expect(maxTotal).toBe(100);
    expect(health.components.map((c) => c.maxScore)).toEqual([
      HEALTH_WEIGHTS.savings,
      HEALTH_WEIGHTS.budgetAdherence,
      HEALTH_WEIGHTS.emergencyFund,
      HEALTH_WEIGHTS.debtBurden,
      HEALTH_WEIGHTS.cashFlowStability,
      HEALTH_WEIGHTS.investmentProgress,
    ]);
  });

  it('scores a well-funded saver above a stretched one', () => {
    expect(healthFor(healthyContext()).score).toBeGreaterThan(healthFor(shaunContext()).score);
  });

  it('maps scores onto the documented risk bands', () => {
    expect(riskLevelForScore(90)).toBe(RiskLevel.LOW);
    expect(riskLevelForScore(75)).toBe(RiskLevel.LOW);
    expect(riskLevelForScore(60)).toBe(RiskLevel.MODERATE);
    expect(riskLevelForScore(40)).toBe(RiskLevel.HIGH);
    expect(riskLevelForScore(10)).toBe(RiskLevel.CRITICAL);
  });

  it('penalises a heavy debt load', () => {
    const indebted = makeContext({
      monthlyIncome: 60_000,
      monthlyDebtPayments: 30_000,
      totalDebtOutstanding: 800_000,
      accounts: [{ balance: 20_000, availableBalance: 20_000 }],
      priorMonths: [
        { income: 60_000, essential: 25_000, discretionary: 12_000, debt: 30_000 },
        { income: 60_000, essential: 26_000, discretionary: 11_000, debt: 30_000 },
      ],
      transactions: [{ amount: 60_000, categoryKey: 'salary', day: 1 }],
    });
    const health = healthFor(indebted);
    const debtComponent = health.components.find((c) => c.key === 'debtBurden');
    expect(debtComponent?.score).toBe(0);
    expect(health.riskLevel === RiskLevel.HIGH || health.riskLevel === RiskLevel.CRITICAL).toBe(true);
  });

  it('scores cash flow neutrally when history is too short to judge', () => {
    const newUser = makeContext({
      priorMonths: [],
      transactions: [{ amount: 75_000, categoryKey: 'salary', day: 1 }],
    });
    const component = healthFor(newUser).components.find((c) => c.key === 'cashFlowStability');
    expect(component?.score).toBe(round(0.6 * HEALTH_WEIGHTS.cashFlowStability, 2));
    expect(component?.detail).toMatch(/not enough history/i);
  });

  it('applies what-if overrides without touching the stored snapshot', () => {
    const { snapshot, internals } = buildSnapshot(healthyContext());
    const before = computeFinancialHealth(snapshot, internals);
    const after = computeFinancialHealth(snapshot, internals, {
      savingsRatePercent: 0,
      emergencyFundMonths: 0,
    });
    expect(after.score).toBeLessThan(before.score);
    expect(snapshot.projectedSavingsRatePercent).toBeGreaterThan(0);
  });
});
