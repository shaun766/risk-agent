import {
  CategoryKind,
  type BehaviouralInsight,
  type EngineContext,
  type EngineTransaction,
  type FinancialSnapshot,
  formatINR,
  round,
  safeRatio,
  toPercent,
} from '@flowmoney/shared-types';
import { mean } from './aggregate';
import type { SnapshotInternals } from './snapshot';

function directionOf(changePercent: number): 'UP' | 'DOWN' | 'FLAT' {
  if (changePercent > 5) return 'UP';
  if (changePercent < -5) return 'DOWN';
  return 'FLAT';
}

const isWeekend = (iso: string): boolean => {
  const day = new Date(iso).getUTCDay();
  return day === 0 || day === 6;
};

/**
 * Behavioural insights: comparisons of the user against their own history.
 * Each one carries the raw metric and its comparison so the LLM can restate it
 * without recomputing anything.
 */
export function buildBehaviouralInsights(
  ctx: EngineContext,
  snapshot: FinancialSnapshot,
  internals: SnapshotInternals,
): BehaviouralInsight[] {
  const insights: BehaviouralInsight[] = [];
  const periodStart = internals.period.start.getTime();
  const periodEnd = internals.period.end.getTime();

  const inPeriod = (t: EngineTransaction) => {
    const time = new Date(t.occurredAt).getTime();
    return time >= periodStart && time <= periodEnd;
  };
  const beforePeriod = (t: EngineTransaction) => new Date(t.occurredAt).getTime() < periodStart;

  const debits = ctx.transactions.filter((t) => t.direction === 'DEBIT' && !t.isPending);
  const currentDebits = debits.filter(inPeriod);
  const historicDebits = debits.filter(beforePeriod);
  const completedMonths = internals.monthlyAggregates.filter((a) => a.month !== internals.period.key);
  const monthsSpanned = Math.max(completedMonths.length, 1);

  // --- category vs personal baseline ---------------------------------------
  const categories = new Set(currentDebits.map((t) => t.categoryKey));
  for (const key of categories) {
    const current = currentDebits
      .filter((t) => t.categoryKey === key)
      .reduce((s, t) => s + t.amount, 0);
    const historical = historicDebits.filter((t) => t.categoryKey === key);
    if (historical.length < 3) continue;
    const baseline = historical.reduce((s, t) => s + t.amount, 0) / monthsSpanned;
    if (baseline <= 0) continue;
    const changePercent = toPercent(safeRatio(current - baseline, baseline));
    if (Math.abs(changePercent) < 25) continue;

    const label = snapshot.categoryBreakdown.find((c) => c.categoryKey === key)?.categoryLabel ?? key;
    insights.push({
      key: `category_trend_${key}`,
      headline:
        changePercent > 0
          ? `You spent ${Math.abs(changePercent)}% more on ${label} than your ${monthsSpanned}-month average.`
          : `${label} spending is down ${Math.abs(changePercent)}% versus your ${monthsSpanned}-month average.`,
      detail: `${formatINR(current)} this month against a ${formatINR(baseline)} average.`,
      metric: round(current, 2),
      comparison: round(baseline, 2),
      changePercent,
      direction: directionOf(changePercent),
    });
  }

  // --- weekend concentration -----------------------------------------------
  const discretionary = currentDebits.filter((t) => t.categoryKind === CategoryKind.DISCRETIONARY);
  const discretionaryTotal = discretionary.reduce((s, t) => s + t.amount, 0);
  if (discretionaryTotal > 0) {
    const weekendTotal = discretionary
      .filter((t) => isWeekend(t.occurredAt))
      .reduce((s, t) => s + t.amount, 0);
    const sharePercent = toPercent(safeRatio(weekendTotal, discretionaryTotal));
    if (sharePercent >= 25) {
      insights.push({
        key: 'weekend_concentration',
        headline: `Weekend spending accounts for ${sharePercent}% of your discretionary expenses.`,
        detail: `${formatINR(weekendTotal)} of ${formatINR(discretionaryTotal)} in discretionary spending happened on Saturdays and Sundays.`,
        metric: round(weekendTotal, 2),
        comparison: round(discretionaryTotal, 2),
        changePercent: sharePercent,
        direction: 'FLAT',
      });
    }
  }

  // --- small-transaction drag ----------------------------------------------
  const smallTransactions = discretionary.filter((t) => t.amount <= 500);
  if (smallTransactions.length >= 10) {
    const total = smallTransactions.reduce((s, t) => s + t.amount, 0);
    insights.push({
      key: 'small_transaction_drag',
      headline: `${smallTransactions.length} small purchases added up to ${formatINR(total)}.`,
      detail: `Individually under ₹500 each, they account for ${toPercent(safeRatio(total, discretionaryTotal))}% of your discretionary spending.`,
      metric: round(total, 2),
      comparison: round(discretionaryTotal, 2),
      changePercent: toPercent(safeRatio(total, discretionaryTotal)),
      direction: 'FLAT',
    });
  }

  // --- savings pace --------------------------------------------------------
  if (internals.savingsTarget > 0) {
    const expectedByNow =
      snapshot.savingsTarget * (snapshot.period.daysElapsed / snapshot.period.totalDays);
    const changePercent = toPercent(safeRatio(snapshot.savingsProgress - expectedByNow, Math.max(expectedByNow, 1)));
    insights.push({
      key: 'savings_pace',
      headline:
        changePercent >= 0
          ? `You are ahead of your savings pace by ${Math.abs(changePercent)}%.`
          : `You are behind your savings pace by ${Math.abs(changePercent)}%.`,
      detail: `${formatINR(snapshot.savingsProgress)} saved against ${formatINR(expectedByNow)} expected ${snapshot.period.daysElapsed} days into the month.`,
      metric: round(snapshot.savingsProgress, 2),
      comparison: round(expectedByNow, 2),
      changePercent,
      direction: directionOf(changePercent),
    });
  }

  // --- income stability ----------------------------------------------------
  if (completedMonths.length >= 3) {
    const incomes = completedMonths.slice(-3).map((a) => a.income / 100);
    const avg = mean(incomes);
    const spread = Math.max(...incomes) - Math.min(...incomes);
    if (avg > 0 && spread / avg > 0.15) {
      insights.push({
        key: 'income_variability',
        headline: `Your income varied by ${toPercent(safeRatio(spread, avg))}% over the last three months.`,
        detail: `Variable income makes a larger emergency buffer more valuable than a fixed-salary equivalent.`,
        metric: round(spread, 2),
        comparison: round(avg, 2),
        changePercent: toPercent(safeRatio(spread, avg)),
        direction: 'FLAT',
      });
    }
  }

  return insights
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 8);
}
