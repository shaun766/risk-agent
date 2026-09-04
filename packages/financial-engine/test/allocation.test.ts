import { describe, expect, it } from 'vitest';
import { AllocationBucket, RiskTolerance, round } from '@flowmoney/shared-types';
import { analyseIdleCash, buildAllocationPlan, buildSnapshot, findSavingsOpportunities } from '../src';
import { healthyContext, makeContext } from './fixtures';

describe('idle cash detection', () => {
  it('reserves upcoming bills and the emergency reserve before naming a surplus', () => {
    const ctx = makeContext({
      monthlyIncome: 90_000,
      accounts: [{ balance: 180_000, availableBalance: 180_000 }],
      priorMonths: [
        { income: 90_000, essential: 35_000, discretionary: 15_000, savings: 20_000 },
        { income: 90_000, essential: 35_000, discretionary: 15_000, savings: 20_000 },
      ],
      transactions: [{ amount: 90_000, categoryKey: 'salary', day: 1 }],
      obligations: [{ label: 'Rent', amount: 45_000, dueDay: 28, categoryKey: 'housing' }],
      emergencyReserveAmount: 60_000,
    });
    const { snapshot, internals } = buildSnapshot(ctx);
    const idle = analyseIdleCash(snapshot, internals);

    expect(idle.upcomingExpenses30d).toBe(45_000);
    expect(idle.emergencyReserve).toBe(60_000);
    expect(idle.surplusCash).toBe(75_000);
    expect(idle.hasSurplus).toBe(true);
    expect(idle.explanation).toMatch(/surplus/i);
  });

  it('reports no surplus when cash is already committed', () => {
    const ctx = makeContext({
      accounts: [{ balance: 30_000, availableBalance: 30_000 }],
      transactions: [{ amount: 75_000, categoryKey: 'salary', day: 1 }],
      emergencyReserveAmount: 60_000,
    });
    const { snapshot, internals } = buildSnapshot(ctx);
    const idle = analyseIdleCash(snapshot, internals);
    expect(idle.surplusCash).toBe(0);
    expect(idle.hasSurplus).toBe(false);
  });
});

describe('allocation planner', () => {
  const planFor = (tolerance: RiskTolerance, surplus = 40_000) => {
    const ctx = makeContext({
      monthlyIncome: 90_000,
      accounts: [
        { balance: 200_000, availableBalance: 200_000 },
        // A dedicated emergency account holding only a third of the target,
        // so the planner has a real gap to close.
        { balance: 20_000, availableBalance: 20_000, isEmergencyFund: true },
      ],
      priorMonths: [
        { income: 90_000, essential: 30_000, discretionary: 15_000, savings: 20_000 },
        { income: 90_000, essential: 30_000, discretionary: 15_000, savings: 20_000 },
      ],
      transactions: [{ amount: 90_000, categoryKey: 'salary', day: 1 }],
      emergencyReserveAmount: 60_000,
    });
    const { snapshot, internals } = buildSnapshot(ctx);
    return buildAllocationPlan({ surplus, snapshot, internals, ctx, riskTolerance: tolerance });
  };

  it('allocates the whole surplus and never more', () => {
    const plan = planFor(RiskTolerance.MODERATE);
    expect(plan.surplusCash).toBe(40_000);
    expect(round(plan.totalAllocated, 2)).toBeLessThanOrEqual(40_000);
    expect(plan.totalAllocated).toBeGreaterThan(39_000);
  });

  it('prioritises the emergency fund gap ahead of growth', () => {
    const plan = planFor(RiskTolerance.MODERATE);
    const buckets = plan.suggestions.map((s) => s.bucket);
    expect(buckets[0]).toBe(AllocationBucket.EMERGENCY_FUND);
    expect(plan.suggestions[0]?.amount).toBe(20_000);
    expect(buckets).toContain(AllocationBucket.LIQUID_RESERVE);
    expect(buckets).toContain(AllocationBucket.LONG_TERM_GROWTH);
  });

  it('shifts weight towards growth as risk tolerance rises', () => {
    const growthOf = (tolerance: RiskTolerance) =>
      planFor(tolerance).suggestions.find((s) => s.bucket === AllocationBucket.LONG_TERM_GROWTH)
        ?.amount ?? 0;

    expect(growthOf(RiskTolerance.AGGRESSIVE)).toBeGreaterThan(growthOf(RiskTolerance.MODERATE));
    expect(growthOf(RiskTolerance.MODERATE)).toBeGreaterThan(growthOf(RiskTolerance.CONSERVATIVE));
  });

  it('pays down debt before investing anything', () => {
    const ctx = makeContext({
      monthlyIncome: 90_000,
      accounts: [{ balance: 200_000, availableBalance: 200_000 }],
      transactions: [{ amount: 90_000, categoryKey: 'salary', day: 1 }],
      monthlyDebtPayments: 12_000,
      totalDebtOutstanding: 250_000,
      emergencyReserveAmount: 40_000,
    });
    const { snapshot, internals } = buildSnapshot(ctx);
    const plan = buildAllocationPlan({
      surplus: 50_000,
      snapshot,
      internals,
      ctx,
      riskTolerance: RiskTolerance.AGGRESSIVE,
    });
    expect(plan.suggestions[0]?.bucket).toBe(AllocationBucket.DEBT_REPAYMENT);
    expect(plan.suggestions[0]?.amount).toBe(15_000);
  });

  it('always attaches the educational disclaimer', () => {
    expect(planFor(RiskTolerance.MODERATE).disclaimer).toMatch(/not personalised investment advice/i);
  });
});

describe('savings opportunities', () => {
  it('surfaces categories running over their allocation with evidence', () => {
    const ctx = makeContext({
      transactions: [
        { amount: 75_000, categoryKey: 'salary', day: 1 },
        { amount: 12_000, categoryKey: 'dining', day: 5, merchantName: 'Swiggy' },
      ],
      allocations: [{ categoryKey: 'dining', allocated: 6_000 }],
    });
    const { snapshot, internals } = buildSnapshot(ctx);
    const opportunities = findSavingsOpportunities(ctx, snapshot, internals);
    const dining = opportunities.find((o) => o.categoryKey === 'dining');

    expect(dining?.monthlySaving).toBe(6_000);
    expect(dining?.annualSaving).toBe(72_000);
    expect(dining?.evidence).toContain('₹');
  });

  it('returns nothing for a user spending inside every envelope', () => {
    const ctx = healthyContext();
    const { snapshot, internals } = buildSnapshot(ctx);
    expect(findSavingsOpportunities(ctx, snapshot, internals)).toHaveLength(0);
  });
});
