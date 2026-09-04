import {
  ENGINE_VERSION,
  type BudgetStatus,
  type EngineContext,
  type FinancialHealth,
  type FinancialSnapshot,
  type Minor,
  type MonthlyReportData,
  type PurchaseVerdict,
  clampNonNegative,
  formatINR,
  fromMinor,
  round,
  safeRatio,
  toMinor,
  toPercent,
} from '@flowmoney/shared-types';
import { buildBehaviouralInsights } from './insights';
import { findSavingsOpportunities } from './idle-cash';
import type { SnapshotInternals } from './snapshot';
import { monthKeyOf } from './period';

export interface MonthlyReportInputs {
  ctx: EngineContext;
  snapshot: FinancialSnapshot;
  internals: SnapshotInternals;
  health: FinancialHealth;
  budgetStatus: BudgetStatus | null;
  /** Historical scores supplied by the repository, oldest first. */
  healthTrend?: Array<{ month: string; score: number }>;
  purchaseDecisions?: Array<{
    description: string;
    price: number;
    verdict: PurchaseVerdict;
    score: number;
    createdAt: string;
  }>;
}

/**
 * Assembles the full monthly report from deterministic analytics only. The
 * Monthly Report Agent turns this into prose; it adds no numbers of its own.
 */
export function buildMonthlyReport({
  ctx,
  snapshot,
  internals,
  health,
  budgetStatus,
  healthTrend = [],
  purchaseDecisions = [],
}: MonthlyReportInputs): MonthlyReportData {
  const month = internals.period.key;
  const previousKey = monthKeyOf(
    new Date(Date.UTC(internals.period.start.getUTCFullYear(), internals.period.start.getUTCMonth() - 1, 1)),
  );
  const previousAggregate = internals.monthlyAggregates.find((a) => a.month === previousKey);

  const income = snapshot.monthlyIncome;
  const totalSpending = snapshot.totalSpentThisPeriod;
  const savings = snapshot.savedThisPeriod;
  const investments = snapshot.investedThisPeriod;
  const netCashFlow = round(income - totalSpending - savings - investments, 2);

  const previousMonth = previousAggregate
    ? {
        income: fromMinor(previousAggregate.income),
        totalSpending: fromMinor(previousAggregate.totalSpend),
        savings: fromMinor(previousAggregate.savings),
        savingsRatePercent: toPercent(
          safeRatio(previousAggregate.savings, previousAggregate.income || 1),
        ),
      }
    : null;

  // ---- merchants & largest transactions -----------------------------------
  const periodStart = internals.period.start.getTime();
  const periodEnd = internals.period.end.getTime();
  const periodDebits = ctx.transactions.filter((t) => {
    const time = new Date(t.occurredAt).getTime();
    return t.direction === 'DEBIT' && !t.isPending && time >= periodStart && time <= periodEnd;
  });

  const merchantTotals = new Map<string, { amount: number; count: number }>();
  for (const txn of periodDebits) {
    const key = txn.merchantName ?? txn.description ?? 'Unknown';
    const entry = merchantTotals.get(key) ?? { amount: 0, count: 0 };
    entry.amount += txn.amount;
    entry.count += 1;
    merchantTotals.set(key, entry);
  }
  const topMerchants = [...merchantTotals.entries()]
    .map(([merchant, v]) => ({ merchant, amount: round(v.amount, 2), count: v.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  const largestTransactions = [...periodDebits]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8)
    .map((t) => ({
      description: t.description ?? t.merchantName ?? 'Transaction',
      amount: round(t.amount, 2),
      category: t.categoryKey,
      occurredAt: t.occurredAt,
    }));

  // ---- recommendations ----------------------------------------------------
  const opportunities = findSavingsOpportunities(ctx, snapshot, internals);
  const recommendations = opportunities.map((o) => ({
    title: o.title,
    detail: o.evidence,
    impact: o.annualSaving,
  }));

  if (snapshot.emergencyFundMonths < snapshot.emergencyFundTargetMonths) {
    // The gap is measured against the months-of-cover target, not the user's
    // configured protection floor — those are different ideas.
    const targetBalance = Math.round(
      internals.essentialMonthlyBaseline * snapshot.emergencyFundTargetMonths,
    ) as Minor;
    const gap = clampNonNegative(targetBalance - internals.emergencyFundBalance) as Minor;
    const monthly = Math.max(Math.round(gap / 6), toMinor(1000)) as Minor;
    recommendations.unshift({
      title: `Close a ${formatINR(fromMinor(gap))} emergency fund gap`,
      detail: `Contributing ${formatINR(fromMinor(monthly))} per month reaches your ${snapshot.emergencyFundTargetMonths}-month target in about ${Math.ceil(gap / monthly)} months.`,
      impact: round(fromMinor(gap), 2),
    });
  }

  // ---- forecast -----------------------------------------------------------
  const forecastBasis =
    internals.monthlyAggregates.length >= 3
      ? 'Blend of your three-month spending average and this month\'s observed pace, plus known recurring commitments.'
      : 'This month\'s observed pace plus known recurring commitments (limited history available).';

  const projectedSpending = fromMinor(internals.projectedMonthEndSpend);
  const projectedSavings = fromMinor(internals.projectedSavings);
  const projectedBalance = round(
    snapshot.totalBalance + snapshot.incomeExpectedRemaining - (projectedSpending - totalSpending),
    2,
  );

  return {
    month,
    periodStart: snapshot.period.start,
    periodEnd: snapshot.period.end,
    overview: {
      income,
      totalSpending,
      savings,
      investments,
      netCashFlow,
      savingsRatePercent: snapshot.currentSavingsRatePercent,
    },
    previousMonth,
    spendingBreakdown: snapshot.categoryBreakdown,
    budgetPerformance: budgetStatus,
    insights: buildBehaviouralInsights(ctx, snapshot, internals),
    health,
    healthTrend: [...healthTrend, { month, score: health.score }].filter(
      (entry, index, all) => all.findIndex((e) => e.month === entry.month) === index,
    ),
    savingsPerformance: {
      target: snapshot.savingsTarget,
      actual: snapshot.savingsProgress,
      achievedPercent: toPercent(safeRatio(snapshot.savingsProgress, snapshot.savingsTarget || 1)),
      shortfall: snapshot.savingsShortfall,
    },
    investmentActivity: {
      contributions: investments,
      portfolioValue: ctx.portfolioValue,
      contributionChangePercent: previousAggregate
        ? toPercent(
            safeRatio(
              toMinor(investments) - previousAggregate.investment,
              Math.max(previousAggregate.investment, 1),
            ),
          )
        : 0,
    },
    topMerchants,
    largestTransactions,
    purchaseDecisions,
    recommendations: recommendations.slice(0, 6),
    forecast: {
      projectedSpending,
      projectedSavings,
      projectedBalance,
      basis: forecastBasis,
    },
    engineVersion: ENGINE_VERSION,
    computedAt: snapshot.asOf,
  };
}
