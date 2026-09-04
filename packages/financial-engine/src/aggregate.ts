import {
  CategoryKind,
  type EngineTransaction,
  ZERO,
  addMinor,
  toMinor,
  type Minor,
} from '@flowmoney/shared-types';
import { monthKeyOf } from './period';

/** Per-month roll-up used for baselines, trends and cash-flow stability. */
export interface MonthlyAggregate {
  month: string;
  income: Minor;
  essential: Minor;
  discretionary: Minor;
  debt: Minor;
  savings: Minor;
  investment: Minor;
  totalSpend: Minor;
  net: Minor;
  transactionCount: number;
}

const emptyAggregate = (month: string): MonthlyAggregate => ({
  month,
  income: ZERO,
  essential: ZERO,
  discretionary: ZERO,
  debt: ZERO,
  savings: ZERO,
  investment: ZERO,
  totalSpend: ZERO,
  net: ZERO,
  transactionCount: 0,
});

/**
 * Spending is essential + discretionary + debt service. Savings and investment
 * outflows are *destinations*, not spending, and are tracked separately — this
 * distinction is what stops "I transferred to my SIP" from looking like
 * overspending.
 */
export function isSpendKind(kind: CategoryKind): boolean {
  return (
    kind === CategoryKind.ESSENTIAL ||
    kind === CategoryKind.DISCRETIONARY ||
    kind === CategoryKind.DEBT
  );
}

export function aggregateByMonth(transactions: EngineTransaction[]): Map<string, MonthlyAggregate> {
  const byMonth = new Map<string, MonthlyAggregate>();

  for (const txn of transactions) {
    if (txn.isPending) continue;
    const month = monthKeyOf(new Date(txn.occurredAt));
    const agg = byMonth.get(month) ?? emptyAggregate(month);
    const amount = toMinor(txn.amount);
    agg.transactionCount += 1;

    if (txn.direction === 'CREDIT') {
      if (txn.categoryKind === CategoryKind.INCOME) agg.income = addMinor(agg.income, amount);
      // Non-income credits (refunds, transfers in) intentionally do not inflate
      // income — they would distort every ratio built on it.
    } else {
      switch (txn.categoryKind) {
        case CategoryKind.ESSENTIAL:
          agg.essential = addMinor(agg.essential, amount);
          break;
        case CategoryKind.DISCRETIONARY:
          agg.discretionary = addMinor(agg.discretionary, amount);
          break;
        case CategoryKind.DEBT:
          agg.debt = addMinor(agg.debt, amount);
          break;
        case CategoryKind.SAVINGS:
          agg.savings = addMinor(agg.savings, amount);
          break;
        case CategoryKind.INVESTMENT:
          agg.investment = addMinor(agg.investment, amount);
          break;
        default:
          break; // TRANSFER / INCOME debits are ignored
      }
    }
    byMonth.set(month, agg);
  }

  for (const agg of byMonth.values()) {
    agg.totalSpend = addMinor(agg.essential, agg.discretionary, agg.debt);
    agg.net = (agg.income - agg.totalSpend - agg.savings - agg.investment) as Minor;
  }

  return byMonth;
}

export function sumWhere(
  transactions: EngineTransaction[],
  predicate: (t: EngineTransaction) => boolean,
): Minor {
  let total = 0;
  for (const txn of transactions) {
    if (txn.isPending) continue;
    if (predicate(txn)) total += toMinor(txn.amount);
  }
  return total as Minor;
}

export function debitsOfKind(kind: CategoryKind) {
  return (t: EngineTransaction) => t.direction === 'DEBIT' && t.categoryKind === kind;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return sorted[mid] ?? 0;
}
