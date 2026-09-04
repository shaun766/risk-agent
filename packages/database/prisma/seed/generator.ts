import { CategoryKind, categoryKind } from '@flowmoney/shared-types';
import { MERCHANTS } from './catalogue';
import type { Persona } from './personas';
import { money, type Rng } from './rng';

export interface GeneratedTransaction {
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  categoryKey: string;
  categoryKind: CategoryKind;
  merchantName: string | null;
  description: string;
  occurredAt: Date;
  isRecurring: boolean;
}

const MONTHS_OF_HISTORY = 6;

/** Categories billed once a month on a fixed day rather than spread out. */
const FIXED_ESSENTIALS = new Set(['housing', 'insurance', 'education']);

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function at(year: number, monthIndex: number, day: number, hour: number, minute = 0): Date {
  const clamped = Math.min(Math.max(day, 1), daysInMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, clamped, hour, minute, 0, 0));
}

function merchantFor(rng: Rng, categoryKey: string): string {
  const options = MERCHANTS[categoryKey];
  return options && options.length > 0 ? rng.pick(options) : 'Miscellaneous';
}

/**
 * Splits a monthly total into `count` transactions on distinct days, with
 * realistic variation in both amount and timing.
 */
function spread(
  rng: Rng,
  total: number,
  count: number,
  maxDay: number,
): Array<{ amount: number; day: number }> {
  if (total <= 0 || count <= 0 || maxDay < 1) return [];
  const weights = Array.from({ length: count }, () => rng.float(0.6, 1.4));
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  const rows: Array<{ amount: number; day: number }> = [];
  let allocated = 0;

  for (let i = 0; i < count; i += 1) {
    const isLast = i === count - 1;
    const amount = isLast
      ? money(total - allocated)
      : money((total * (weights[i] ?? 1)) / weightTotal);
    allocated += amount;
    if (amount <= 0) continue;
    rows.push({ amount, day: rng.int(1, maxDay) });
  }
  return rows.sort((a, b) => a.day - b.day);
}

/**
 * Produces six months of statement-like history for a persona. The current
 * month is generated only up to `now`, so a mid-month seed looks exactly like a
 * mid-month account: some bills paid, some still upcoming.
 */
export function generateTransactions(persona: Persona, rng: Rng, now: Date): GeneratedTransaction[] {
  const transactions: GeneratedTransaction[] = [];
  const currentDay = now.getUTCDate();

  const push = (row: GeneratedTransaction) => {
    if (row.amount <= 0) return;
    transactions.push(row);
  };

  for (let offset = -(MONTHS_OF_HISTORY - 1); offset <= 0; offset += 1) {
    const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const year = anchor.getUTCFullYear();
    const monthIndex = anchor.getUTCMonth();
    const totalDays = daysInMonth(year, monthIndex);
    const isCurrent = offset === 0;
    const maxDay = isCurrent ? currentDay : totalDays;
    // Prorate variable spending in the in-flight month.
    const progress = isCurrent ? Math.min(currentDay / totalDays, 1) : 1;
    const override = isCurrent ? persona.currentMonthOverride : undefined;

    // ---- income ----------------------------------------------------------
    const incomeAmount = money(
      persona.income * (1 + (rng.next() * 2 - 1) * persona.incomeVolatility),
    );
    if (persona.incomeDay <= maxDay) {
      push({
        amount: incomeAmount,
        direction: 'CREDIT',
        categoryKey: 'salary',
        categoryKind: CategoryKind.INCOME,
        merchantName: 'Monthly Salary',
        description: persona.employmentType === 'SALARIED' ? 'Salary credit' : 'Client payment',
        occurredAt: at(year, monthIndex, persona.incomeDay, 9, 30),
        isRecurring: true,
      });
    }
    // Freelancers pick up occasional extra work.
    if (persona.incomeVolatility > 0.2 && rng.chance(0.5)) {
      const extraDay = rng.int(10, 26);
      if (extraDay <= maxDay) {
        push({
          amount: money(persona.income * rng.float(0.08, 0.22)),
          direction: 'CREDIT',
          categoryKey: 'other_income',
          categoryKind: CategoryKind.INCOME,
          merchantName: merchantFor(rng, 'other_income'),
          description: 'Additional project income',
          occurredAt: at(year, monthIndex, extraDay, 14),
          isRecurring: false,
        });
      }
    }

    // ---- savings & investments ------------------------------------------
    const savingsAmount = override ? override.savings : money(rng.jitter(persona.savingsMonthly, 0.15));
    const savingsDay = Math.min(persona.incomeDay + 1, totalDays);
    if (savingsAmount > 0 && savingsDay <= maxDay) {
      push({
        amount: savingsAmount,
        direction: 'DEBIT',
        categoryKey: 'savings',
        categoryKind: CategoryKind.SAVINGS,
        merchantName: 'Savings Transfer',
        description: 'Transfer to savings',
        occurredAt: at(year, monthIndex, savingsDay, 10),
        isRecurring: true,
      });
    }

    const investmentDay = Math.min(persona.incomeDay + 2, totalDays);
    if (persona.investmentMonthly > 0 && investmentDay <= maxDay) {
      push({
        amount: money(persona.investmentMonthly),
        direction: 'DEBIT',
        categoryKey: 'investments',
        categoryKind: CategoryKind.INVESTMENT,
        merchantName: merchantFor(rng, 'investments'),
        description: 'Systematic investment plan',
        occurredAt: at(year, monthIndex, investmentDay, 10, 15),
        isRecurring: true,
      });
    }

    // ---- debt service ----------------------------------------------------
    if (persona.debtMonthly > 0) {
      const emi = persona.obligations.find((o) => o.categoryKey === 'debt_repayment');
      const emiDay = emi?.dueDay ?? 8;
      if (emiDay <= maxDay) {
        push({
          amount: money(persona.debtMonthly),
          direction: 'DEBIT',
          categoryKey: 'debt_repayment',
          categoryKind: CategoryKind.DEBT,
          merchantName: emi?.label ?? merchantFor(rng, 'debt_repayment'),
          description: emi?.label ?? 'Loan repayment',
          occurredAt: at(year, monthIndex, emiDay, 7),
          isRecurring: true,
        });
      }
    }

    // ---- essentials ------------------------------------------------------
    for (const [categoryKey, monthlyAmount] of Object.entries(persona.essential)) {
      if (monthlyAmount <= 0) continue;
      const obligation = persona.obligations.find((o) => o.categoryKey === categoryKey);

      if (FIXED_ESSENTIALS.has(categoryKey)) {
        const day = obligation?.dueDay ?? 5;
        if (day > maxDay) continue; // still upcoming this month
        push({
          amount: money(obligation?.amount ?? monthlyAmount),
          direction: 'DEBIT',
          categoryKey,
          categoryKind: CategoryKind.ESSENTIAL,
          merchantName: obligation?.label ?? merchantFor(rng, categoryKey),
          description: obligation?.label ?? `${categoryKey} payment`,
          occurredAt: at(year, monthIndex, day, 8),
          isRecurring: true,
        });
        continue;
      }

      const target = override?.essentialSoFar?.[categoryKey] ?? monthlyAmount * progress;
      for (const row of spread(rng, target, rng.int(3, 6), maxDay)) {
        push({
          amount: row.amount,
          direction: 'DEBIT',
          categoryKey,
          categoryKind: CategoryKind.ESSENTIAL,
          merchantName: merchantFor(rng, categoryKey),
          description: `${merchantFor(rng, categoryKey)} purchase`,
          occurredAt: at(year, monthIndex, row.day, rng.int(8, 21), rng.int(0, 59)),
          isRecurring: false,
        });
      }
    }

    // ---- discretionary ---------------------------------------------------
    // A subscription billed later in the month has not posted yet, so its share
    // must be redistributed rather than silently dropped from the total.
    const discretionaryKeys = Object.keys(persona.discretionary).filter((key) => {
      if (key !== 'subscriptions') return true;
      const obligation = persona.obligations.find((o) => o.categoryKey === 'subscriptions');
      return !obligation || obligation.dueDay <= maxDay;
    });
    const plannedDiscretionary = discretionaryKeys.reduce(
      (sum, key) => sum + (persona.discretionary[key] ?? 0),
      0,
    );
    const monthFactor = isCurrent ? progress : 1 + (rng.next() * 2 - 1) * persona.volatility;
    const discretionaryTotal = override
      ? override.discretionaryTotal
      : plannedDiscretionary * monthFactor;

    for (const categoryKey of discretionaryKeys) {
      const share = (persona.discretionary[categoryKey] ?? 0) / (plannedDiscretionary || 1);
      const categoryTotal = discretionaryTotal * share;
      const obligation = persona.obligations.find((o) => o.categoryKey === categoryKey);

      // Subscriptions bill once, on a fixed day.
      if (categoryKey === 'subscriptions' && obligation) {
        if (obligation.dueDay > maxDay) continue;
        push({
          amount: money(obligation.amount),
          direction: 'DEBIT',
          categoryKey,
          categoryKind: CategoryKind.DISCRETIONARY,
          merchantName: obligation.label,
          description: obligation.label,
          occurredAt: at(year, monthIndex, obligation.dueDay, 6),
          isRecurring: true,
        });
        continue;
      }

      const count = categoryKey === 'travel' ? rng.int(1, 2) : rng.int(2, 7);
      for (const row of spread(rng, categoryTotal, count, maxDay)) {
        const merchant = merchantFor(rng, categoryKey);
        push({
          amount: row.amount,
          direction: 'DEBIT',
          categoryKey,
          categoryKind: categoryKind(categoryKey),
          merchantName: merchant,
          description: `${merchant}`,
          occurredAt: at(year, monthIndex, row.day, rng.int(9, 23), rng.int(0, 59)),
          isRecurring: categoryKey === 'subscriptions',
        });
      }
    }
  }

  // A generated timestamp later today would be a future-dated transaction: the
  // API filters those out, so the seeded totals would silently disagree with
  // what the dashboard shows. Pull anything ahead of `now` back behind it.
  for (const txn of transactions) {
    if (txn.occurredAt.getTime() > now.getTime()) {
      txn.occurredAt = new Date(now.getTime() - 60_000);
    }
  }

  return transactions.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

/**
 * Reconstructs daily closing balances by walking backwards from the known
 * current balance, so the chart in the dashboard reconciles with the account.
 */
export function buildBalanceHistory(
  transactions: GeneratedTransaction[],
  currentBalance: number,
  now: Date,
  days = 90,
): Array<{ recordedAt: Date; balance: number }> {
  const netByDay = new Map<string, number>();
  for (const txn of transactions) {
    const key = txn.occurredAt.toISOString().slice(0, 10);
    const delta = txn.direction === 'CREDIT' ? txn.amount : -txn.amount;
    netByDay.set(key, (netByDay.get(key) ?? 0) + delta);
  }

  const rows: Array<{ recordedAt: Date; balance: number }> = [];
  let balance = currentBalance;

  for (let i = 0; i < days; i += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i, 23, 59, 0));
    rows.push({ recordedAt: date, balance: money(balance) });
    balance -= netByDay.get(date.toISOString().slice(0, 10)) ?? 0;
  }

  return rows.reverse();
}
