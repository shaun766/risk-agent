import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src';
import { healthyContext, makeContext, shaunContext } from './fixtures';

describe('financial snapshot', () => {
  it('reproduces the reference scenario from the product spec', () => {
    const { snapshot, internals } = buildSnapshot(shaunContext());

    expect(snapshot.monthlyIncome).toBe(75_000);
    expect(snapshot.totalBalance).toBe(62_000);
    // Discretionary envelope is 30% of income; ₹10,500 already spent.
    expect(snapshot.discretionaryBudget).toBe(22_500);
    expect(snapshot.discretionaryBudgetRemaining).toBe(12_000);
    // Rent (₹18,000) and subscriptions (₹2,000) are still due.
    expect(snapshot.upcomingRecurringPayments).toBe(20_000);
    expect(snapshot.emergencyReserveAmount).toBe(54_000);
    // 62,000 − 20,000 upcoming − 54,000 protected reserve.
    expect(snapshot.safelySpendableCash).toBe(-12_000);
    expect(snapshot.savingsTarget).toBe(15_000);
    expect(snapshot.savingsProgress).toBe(9_000);
    expect(internals.dataQuality.incomeObserved).toBe(true);
  });

  it('treats an obligation as settled once a matching payment exists', () => {
    const withRentPaid = makeContext({
      transactions: [
        { amount: 75_000, categoryKey: 'salary', day: 1 },
        { amount: 18_000, categoryKey: 'housing', day: 3, isRecurring: true, merchantName: 'Landlord' },
      ],
      obligations: [{ label: 'Rent', amount: 18_000, dueDay: 5, categoryKey: 'housing' }],
    });
    const { snapshot } = buildSnapshot(withRentPaid);
    expect(snapshot.upcomingRecurringPayments).toBe(0);
    expect(snapshot.upcomingObligations).toHaveLength(0);
  });

  it('still reserves an obligation when the amount differs materially', () => {
    const partial = makeContext({
      transactions: [
        { amount: 75_000, categoryKey: 'salary', day: 1 },
        { amount: 9_000, categoryKey: 'housing', day: 3, isRecurring: true },
      ],
      obligations: [{ label: 'Rent', amount: 18_000, dueDay: 25, categoryKey: 'housing' }],
    });
    expect(buildSnapshot(partial).snapshot.upcomingRecurringPayments).toBe(18_000);
  });

  it('excludes savings and investment transfers from spending', () => {
    const { snapshot } = buildSnapshot(healthyContext());
    expect(snapshot.savedThisPeriod).toBe(25_000);
    expect(snapshot.investedThisPeriod).toBe(8_000);
    expect(snapshot.totalSpentThisPeriod).toBe(7_000);
  });

  it('keeps a ring-fenced emergency account out of spendable cash', () => {
    const ctx = makeContext({
      accounts: [
        { balance: 40_000, availableBalance: 40_000 },
        { balance: 60_000, availableBalance: 60_000, isEmergencyFund: true },
      ],
      transactions: [{ amount: 75_000, categoryKey: 'salary', day: 1 }],
      emergencyReserveAmount: 60_000,
    });
    const { snapshot } = buildSnapshot(ctx);
    expect(snapshot.totalBalance).toBe(100_000);
    expect(snapshot.emergencyFundBalance).toBe(60_000);
    // The reserve is already held separately, so all ₹40,000 stays spendable.
    expect(snapshot.safelySpendableCash).toBe(40_000);
  });

  it('degrades gracefully with no transactions, no budget and no income', () => {
    const empty = makeContext({
      withBudget: false,
      declaredMonthlyIncome: null,
      monthlyIncome: 0,
      accounts: [{ balance: 0, availableBalance: 0 }],
      priorMonths: [],
      transactions: [],
    });
    const { snapshot } = buildSnapshot(empty);
    for (const value of Object.values(snapshot)) {
      if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
    }
    expect(snapshot.monthlyIncome).toBe(0);
    expect(snapshot.projectedSavingsRatePercent).toBe(0);
  });

  it('reconstructs a daily balance series that ends on the current balance', () => {
    const { snapshot } = buildSnapshot(shaunContext());
    const last = snapshot.dailyCashFlow.at(-1);
    expect(snapshot.dailyCashFlow).toHaveLength(15);
    expect(last?.runningBalance).toBe(62_000);
  });
});

describe('month-end projection', () => {
  it('blends observed pace with the user’s own baseline early in the month', () => {
    // Day 3 of the month with one large purchase already made. Naive
    // extrapolation would imply a catastrophic month; the blend should not.
    const ctx = makeContext({
      asOf: '2026-03-03T12:00:00.000Z',
      monthlyIncome: 75_000,
      priorMonths: [
        { income: 75_000, essential: 30_000, discretionary: 15_000, savings: 15_000 },
        { income: 75_000, essential: 30_000, discretionary: 15_000, savings: 15_000 },
        { income: 75_000, essential: 30_000, discretionary: 15_000, savings: 15_000 },
      ],
      transactions: [
        { amount: 75_000, categoryKey: 'salary', day: 1 },
        { amount: 9_000, categoryKey: 'shopping', day: 2 },
      ],
    });
    const { snapshot } = buildSnapshot(ctx);

    // Naive pace would be 9,000 / 3 days x 31 days = 93,000.
    expect(snapshot.projectedMonthEndSpend).toBeLessThan(45_000);
    expect(snapshot.projectedMonthEndSpend).toBeGreaterThan(9_000);
  });

  it('trusts the observed pace once the month is nearly complete', () => {
    const ctx = makeContext({
      asOf: '2026-03-28T12:00:00.000Z',
      monthlyIncome: 75_000,
      priorMonths: [
        { income: 75_000, essential: 30_000, discretionary: 15_000, savings: 15_000 },
        { income: 75_000, essential: 30_000, discretionary: 15_000, savings: 15_000 },
      ],
      transactions: [
        { amount: 75_000, categoryKey: 'salary', day: 1 },
        { amount: 40_000, categoryKey: 'shopping', day: 10 },
        { amount: 12_000, categoryKey: 'dining', day: 20 },
      ],
    });
    const { snapshot } = buildSnapshot(ctx);
    // 52,000 already spent with three days left — the projection must reflect it.
    expect(snapshot.projectedMonthEndSpend).toBeGreaterThanOrEqual(52_000);
    expect(snapshot.projectedMonthEndSpend).toBeLessThan(62_000);
  });
});
