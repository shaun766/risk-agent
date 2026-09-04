import { describe, expect, it } from 'vitest';
import { PurchaseVerdict, round } from '@flowmoney/shared-types';
import { buildSnapshot, evaluatePurchase } from '../src';
import { healthyContext, makeContext, shaunContext } from './fixtures';

function analyse(ctx: ReturnType<typeof makeContext>, request: Parameters<typeof evaluatePurchase>[0]['request']) {
  const { snapshot, internals } = buildSnapshot(ctx);
  return evaluatePurchase({ snapshot, internals, request });
}

describe('purchase decision engine', () => {
  it('refuses a ₹50,000 PS5 for the reference user', () => {
    const decision = analyse(shaunContext(), {
      price: 50_000,
      category: 'shopping',
      description: 'PlayStation 5',
    });

    expect(decision.verdict).toBe(PurchaseVerdict.NOT_RECOMMENDED);
    expect(decision.score).toBeLessThan(40);
    expect(decision.discretionaryBudgetRemaining).toBe(12_000);
    expect(decision.affordabilityGap).toBe(-38_000);
    expect(decision.emergencyReserveBreached).toBe(true);
    expect(decision.primaryReasons.length).toBeGreaterThan(0);
    // A ₹50,000 purchase against ₹12,000 of room must produce a saving plan.
    expect(decision.savingPlan).not.toBeNull();
    expect(decision.savingPlan?.monthsToTarget).toBeGreaterThan(1);
  });

  it('approves a ₹15,000 purchase for a user with healthy reserves', () => {
    const decision = analyse(healthyContext(), { price: 15_000, category: 'shopping' });

    expect([PurchaseVerdict.SMART_BUY, PurchaseVerdict.AFFORDABLE_BUT_CAUTION]).toContain(
      decision.verdict,
    );
    expect(decision.score).toBeGreaterThanOrEqual(60);
    expect(decision.emergencyReserveBreached).toBe(false);
    expect(decision.savingPlan).toBeNull();
  });

  it('reproduces the ₹18,000 phone worked example', () => {
    // ₹9,500 of discretionary room left against an ₹18,000 purchase.
    const ctx = makeContext({
      monthlyIncome: 75_000,
      accounts: [{ balance: 120_000, availableBalance: 120_000 }],
      priorMonths: [
        { income: 75_000, essential: 33_000, discretionary: 20_000, savings: 15_000 },
        { income: 75_000, essential: 34_000, discretionary: 21_000, savings: 15_000 },
      ],
      transactions: [
        { amount: 75_000, categoryKey: 'salary', day: 1 },
        { amount: 13_000, categoryKey: 'dining', day: 6 },
      ],
      emergencyReserveAmount: 60_000,
    });
    const decision = analyse(ctx, { price: 18_000, category: 'shopping' });

    expect(decision.discretionaryBudgetRemaining).toBe(9_500);
    expect(decision.affordabilityGap).toBe(-8_500);
    expect(decision.budgetImpactPercentage).toBe(189.47);
    expect(decision.verdict).not.toBe(PurchaseVerdict.SMART_BUY);
  });

  it('scores a purchase inside the budget higher than the same purchase outside it', () => {
    const ctx = healthyContext();
    const inside = analyse(ctx, { price: 10_000, category: 'shopping' });
    const outside = analyse(ctx, { price: 40_000, category: 'shopping' });
    expect(inside.score).toBeGreaterThan(outside.score);
    expect(inside.projectedSavingsAfterPurchase).toBe(inside.projectedSavingsBeforePurchase);
    expect(outside.projectedSavingsAfterPurchase).toBeLessThan(
      outside.projectedSavingsBeforePurchase,
    );
  });

  it('does not block a small purchase just because the user is under-reserved', () => {
    // Shaun is below his ₹54,000 reserve, but a ₹4,200 dinner sits well inside
    // his discretionary budget and the cash he holds after bills.
    const small = analyse(shaunContext(), { price: 900, category: 'dining' });
    const material = analyse(shaunContext(), { price: 4_200, category: 'dining' });
    const unfundable = analyse(shaunContext(), { price: 45_000, category: 'shopping' });

    expect(small.score).toBeGreaterThan(60);
    // ₹4,200 is a material share of the reserve, so it is capped but not refused.
    expect(material.score).toBeLessThanOrEqual(45);
    expect(material.score).toBeGreaterThanOrEqual(40);
    expect(material.verdict).toBe(PurchaseVerdict.WAIT_AND_SAVE);
    // ₹45,000 exceeds the ₹42,000 left after bills — hard ceiling.
    expect(unfundable.score).toBeLessThanOrEqual(39);
    expect(unfundable.verdict).toBe(PurchaseVerdict.NOT_RECOMMENDED);
  });

  it('only proposes a saving plan for the part that cannot be funded today', () => {
    // ₹12,000 fits exactly inside the ₹12,000 discretionary envelope, so there
    // is nothing to save up for even though the reserve is stretched.
    const fits = analyse(shaunContext(), { price: 12_000, category: 'entertainment' });
    expect(fits.savingPlan).toBeNull();

    // ₹50,000 leaves a ₹38,000 gap over the ₹12,000 that is fundable now.
    const gap = analyse(shaunContext(), { price: 50_000, category: 'shopping' });
    expect(gap.savingPlan?.amountToAccumulate).toBe(38_000);
  });

  it('applies the large-purchase guardrail above half a month of income', () => {
    const rich = makeContext({
      monthlyIncome: 60_000,
      accounts: [{ balance: 900_000, availableBalance: 900_000 }],
      priorMonths: [
        { income: 60_000, essential: 20_000, discretionary: 8_000, savings: 25_000 },
        { income: 60_000, essential: 20_000, discretionary: 8_000, savings: 25_000 },
      ],
      transactions: [{ amount: 60_000, categoryKey: 'salary', day: 1 }],
      emergencyReserveAmount: 120_000,
      allocations: [{ categoryKey: 'shopping', allocated: 200_000 }],
    });
    const decision = analyse(rich, { price: 45_000, category: 'shopping', importance: 5 });
    // Comfortably affordable, but 75% of a month's income is never a "smart buy".
    expect(decision.score).toBeLessThanOrEqual(72);
    expect(decision.verdict).not.toBe(PurchaseVerdict.SMART_BUY);
  });

  it('charges a recurring purchase against ongoing commitments', () => {
    const ctx = healthyContext();
    const oneOff = analyse(ctx, { price: 12_000, category: 'subscriptions' });
    const recurring = analyse(ctx, {
      price: 12_000,
      category: 'subscriptions',
      isRecurring: true,
      monthlyCost: 12_000,
    });

    expect(recurring.recurringImpact).not.toBeNull();
    expect(recurring.recurringImpact?.annualCost).toBe(144_000);
    expect(recurring.score).toBeLessThan(oneOff.score);
  });

  it('grades importance monotonically, all else equal', () => {
    const ctx = healthyContext();
    const scores = [1, 2, 3, 4, 5].map(
      (importance) => analyse(ctx, { price: 8_000, category: 'shopping', importance }).score,
    );
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]!).toBeGreaterThanOrEqual(scores[i - 1]!);
    }
  });

  it('produces factor contributions that sum to the pre-guardrail score', () => {
    const decision = analyse(healthyContext(), { price: 5_000, category: 'dining' });
    const total = round(
      decision.factors.reduce((sum, f) => sum + f.contribution, 0),
      2,
    );
    expect(Math.abs(total - decision.score)).toBeLessThanOrEqual(0.05);
    expect(decision.factors).toHaveLength(7);
  });

  it('is deterministic — the same input always yields the same decision', () => {
    const ctx = shaunContext();
    const a = analyse(ctx, { price: 22_000, category: 'travel' });
    const b = analyse(ctx, { price: 22_000, category: 'travel' });
    expect(a).toEqual(b);
  });

  it('never emits NaN, even for a user with no data at all', () => {
    const empty = makeContext({
      withBudget: false,
      declaredMonthlyIncome: null,
      monthlyIncome: 0,
      accounts: [{ balance: 0, availableBalance: 0 }],
      priorMonths: [],
      transactions: [],
    });
    const decision = analyse(empty, { price: 1_000, category: 'other' });
    for (const [key, value] of Object.entries(decision)) {
      if (typeof value === 'number') {
        expect(Number.isFinite(value), `${key} was not finite`).toBe(true);
      }
    }
    expect(decision.verdict).toBe(PurchaseVerdict.NOT_RECOMMENDED);
  });

  it('reports opportunity cost as an explicitly illustrative figure', () => {
    const decision = analyse(healthyContext(), { price: 18_000, category: 'shopping' });
    expect(decision.opportunityCost.horizonYears).toBe(5);
    expect(decision.opportunityCost.annualRatePercent).toBe(8);
    // 18,000 × 1.08^5 = 26,447.91
    expect(decision.opportunityCost.futureValue).toBeCloseTo(26_447.91, 1);
    expect(decision.opportunityCost.foregoneGrowth).toBeCloseTo(8_447.91, 1);
    expect(decision.opportunityCost.assumptionNote).toMatch(/illustrative/i);
  });
});
