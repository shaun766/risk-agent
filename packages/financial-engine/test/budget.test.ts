import { describe, expect, it } from 'vitest';
import { BudgetStrategy, RiskLevel, round } from '@flowmoney/shared-types';
import { buildSnapshot, computeBudgetStatus, deriveAllocations, strategyCatalogue } from '../src';
import { healthyContext, makeContext } from './fixtures';

describe('budget engine', () => {
  it('publishes all five strategies with valid splits', () => {
    const catalogue = strategyCatalogue();
    expect(catalogue).toHaveLength(5);
    for (const preset of catalogue) {
      const total =
        preset.needsPercent +
        preset.wantsPercent +
        preset.savingsPercent +
        preset.investmentsPercent +
        preset.debtPercent;
      expect(round(total, 2)).toBe(100);
    }
  });

  it('derives per-category allocations that fill each envelope exactly', () => {
    const rows = deriveAllocations(100_000, BudgetStrategy.BALANCED);
    const essentials = rows.filter((r) => r.categoryKind === 'ESSENTIAL');
    const wants = rows.filter((r) => r.categoryKind === 'DISCRETIONARY');
    expect(round(essentials.reduce((s, r) => s + r.allocated, 0), 0)).toBe(50_000);
    expect(round(wants.reduce((s, r) => s + r.allocated, 0), 0)).toBe(30_000);
    expect(rows.find((r) => r.categoryKey === 'savings')?.allocated).toBe(20_000);
  });

  it('adds a debt envelope only for the debt-reduction strategy', () => {
    const balanced = deriveAllocations(100_000, BudgetStrategy.BALANCED);
    const debtFocused = deriveAllocations(100_000, BudgetStrategy.DEBT_REDUCTION);
    expect(balanced.find((r) => r.categoryKey === 'debt_repayment')).toBeUndefined();
    expect(debtFocused.find((r) => r.categoryKey === 'debt_repayment')?.allocated).toBe(20_000);
  });

  it('computes planned versus actual with variance', () => {
    const ctx = healthyContext();
    const { snapshot, internals } = buildSnapshot(ctx);
    const status = computeBudgetStatus(ctx, snapshot, internals);

    expect(status.strategy).toBe(BudgetStrategy.BALANCED);
    expect(status.planned.needs).toBe(45_000);
    expect(status.planned.wants).toBe(27_000);
    expect(status.actual.wants).toBe(2_000);
    expect(status.variance.wants).toBe(25_000);
    expect(status.remaining).toBe(status.totalAllocated - status.totalSpent);
  });

  it('flags a breached category cap with severity', () => {
    const ctx = makeContext({
      transactions: [
        { amount: 75_000, categoryKey: 'salary', day: 1 },
        { amount: 9_000, categoryKey: 'dining', day: 5 },
      ],
      rules: [{ type: 'CATEGORY_MAX', categoryKey: 'dining', amount: 5_000, label: 'Dining maximum' }],
    });
    const { snapshot, internals } = buildSnapshot(ctx);
    const status = computeBudgetStatus(ctx, snapshot, internals);
    const violation = status.ruleViolations.find((v) => v.type === 'CATEGORY_MAX');

    expect(violation).toBeDefined();
    expect(violation?.exceededBy).toBe(4_000);
    expect(violation?.severity).toBe(RiskLevel.CRITICAL);
  });

  it('judges a savings minimum on pace, not on the full month', () => {
    // Half way through the month with half the target saved is on pace.
    const onPace = makeContext({
      asOf: '2026-03-15T12:00:00.000Z',
      transactions: [
        { amount: 75_000, categoryKey: 'salary', day: 1 },
        { amount: 8_000, categoryKey: 'savings', day: 2 },
      ],
      rules: [{ type: 'SAVINGS_MIN', categoryKey: null, amount: 15_000, label: 'Savings minimum' }],
    });
    const behind = makeContext({
      asOf: '2026-03-15T12:00:00.000Z',
      transactions: [
        { amount: 75_000, categoryKey: 'salary', day: 1 },
        { amount: 500, categoryKey: 'savings', day: 2 },
      ],
      rules: [{ type: 'SAVINGS_MIN', categoryKey: null, amount: 15_000, label: 'Savings minimum' }],
    });

    const statusFor = (ctx: ReturnType<typeof makeContext>) => {
      const { snapshot, internals } = buildSnapshot(ctx);
      return computeBudgetStatus(ctx, snapshot, internals);
    };

    expect(statusFor(onPace).ruleViolations).toHaveLength(0);
    expect(statusFor(behind).ruleViolations[0]?.severity).toBe(RiskLevel.HIGH);
  });

  it('spreads remaining discretionary budget across the days left', () => {
    const ctx = healthyContext();
    const { snapshot, internals } = buildSnapshot(ctx);
    const status = computeBudgetStatus(ctx, snapshot, internals);
    expect(status.daysRemaining).toBe(16);
    expect(status.safeDailySpend).toBe(round(25_000 / 16, 2));
  });
});
