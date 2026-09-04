import {
  ADVICE_DISCLAIMER,
  ALLOCATION_RULES,
  AllocationBucket,
  CategoryKind,
  IDLE_CASH_POLICY,
  RiskTolerance,
  type AllocationPlan,
  type AllocationSuggestion,
  type EngineContext,
  type FinancialSnapshot,
  type IdleCashAnalysis,
  type Minor,
  type SavingsOpportunity,
  clampNonNegative,
  formatINR,
  fromMinor,
  mulMinor,
  round,
  safeRatio,
  toMinor,
  toPercent,
} from '@flowmoney/shared-types';
import { mean } from './aggregate';
import type { SnapshotInternals } from './snapshot';

/**
 * Idle cash is deliberately conservative: it reserves every known bill for the
 * next 30 days *and* the full emergency reserve before calling a rupee surplus.
 * The engine never moves this money — it only names it.
 */
export function analyseIdleCash(
  snapshot: FinancialSnapshot,
  internals: SnapshotInternals,
): IdleCashAnalysis {
  const balances = snapshot.dailyCashFlow.map((p) => toMinor(p.runningBalance));
  const averageBalance = (balances.length
    ? Math.round(mean(balances))
    : toMinor(snapshot.totalBalance)) as Minor;

  const projectedVariableSpend = Math.round(
    toMinor(snapshot.burnRatePerDay) * IDLE_CASH_POLICY.lookforwardDays,
  ) as Minor;
  const upcomingExpenses30d = (internals.upcomingObligationsRemaining + projectedVariableSpend) as Minor;
  const emergencyReserve = internals.reserveRequirement;

  const surplus = clampNonNegative(averageBalance - upcomingExpenses30d - emergencyReserve);
  const hasSurplus = surplus >= toMinor(IDLE_CASH_POLICY.minimumSurplusToReport);

  const explanation = hasSurplus
    ? `Based on your current cash flow, approximately ${formatINR(fromMinor(surplus))} appears to be surplus to your next ${IDLE_CASH_POLICY.lookforwardDays} days of expected expenses (${formatINR(fromMinor(upcomingExpenses30d))}) and your configured emergency reserve (${formatINR(fromMinor(emergencyReserve))}).`
    : `No meaningful idle cash detected. After ${formatINR(fromMinor(upcomingExpenses30d))} of expected expenses and a ${formatINR(fromMinor(emergencyReserve))} emergency reserve, your working balance is already committed.`;

  return {
    averageBalance: fromMinor(averageBalance),
    currentBalance: snapshot.totalBalance,
    upcomingExpenses30d: fromMinor(upcomingExpenses30d),
    emergencyReserve: fromMinor(emergencyReserve),
    surplusCash: fromMinor(surplus),
    hasSurplus,
    explanation,
  };
}

const GROWTH_SPLIT: Record<RiskTolerance, { lowRisk: number; growth: number }> = {
  CONSERVATIVE: { lowRisk: 0.75, growth: 0.25 },
  MODERATE: { lowRisk: 0.5, growth: 0.5 },
  AGGRESSIVE: { lowRisk: 0.25, growth: 0.75 },
};

export interface AllocationInputs {
  surplus: number;
  snapshot: FinancialSnapshot;
  internals: SnapshotInternals;
  ctx: EngineContext;
  riskTolerance: RiskTolerance;
  /** Products the bank has published, used only to suggest concrete options. */
  products?: Array<{ id: string; bucket: string | null; minimumInvestment: number }>;
}

/** Round to a clean ₹100 so suggestions read like advice, not arithmetic. */
function tidy(amount: Minor): Minor {
  const step = toMinor(100);
  return (Math.round(amount / step) * step) as Minor;
}

/**
 * Allocation is a strict waterfall — debt, then safety, then liquidity, then
 * growth. Nothing reaches a growth bucket until the buckets that protect the
 * user are satisfied.
 */
export function buildAllocationPlan({
  surplus,
  snapshot,
  internals,
  ctx,
  riskTolerance,
  products = [],
}: AllocationInputs): AllocationPlan {
  const total = toMinor(surplus);
  const suggestions: AllocationSuggestion[] = [];
  let remaining = total;

  const push = (bucket: AllocationBucket, amount: Minor, rationale: string) => {
    if (amount <= 0) return;
    const rule = ALLOCATION_RULES[bucket];
    suggestions.push({
      bucket,
      label: rule.label,
      amount: fromMinor(amount),
      percentOfSurplus: total > 0 ? toPercent(safeRatio(amount, total)) : 0,
      riskLevel: rule.riskLevel,
      liquidity: rule.liquidity,
      horizon: rule.horizon,
      illustrativeAnnualReturnPercent: rule.illustrativeAnnualReturnPercent,
      rationale,
      suggestedProductIds: products
        .filter((p) => p.bucket === bucket && toMinor(p.minimumInvestment) <= amount)
        .slice(0, 3)
        .map((p) => p.id),
    });
    remaining = (remaining - amount) as Minor;
  };

  // 1. Expensive debt first — no investment reliably beats paying it down.
  if (ctx.totalDebtOutstanding > 0 && ctx.monthlyDebtPayments > 0) {
    const debtSlice = tidy(
      Math.min(mulMinor(total, 0.3), toMinor(ctx.totalDebtOutstanding)) as Minor,
    );
    push(
      AllocationBucket.DEBT_REPAYMENT,
      debtSlice,
      `You carry ${formatINR(ctx.totalDebtOutstanding)} of outstanding debt. Extra repayment removes a guaranteed interest cost, which no investment can promise to beat.`,
    );
  }

  // 2. Close the emergency-fund gap.
  const emergencyGap = clampNonNegative(
    internals.reserveRequirement - internals.emergencyFundBalance,
  );
  if (emergencyGap > 0) {
    const slice = tidy(Math.min(emergencyGap, mulMinor(remaining, 0.5)) as Minor);
    push(
      AllocationBucket.EMERGENCY_FUND,
      slice,
      `Your emergency fund covers ${snapshot.emergencyFundMonths} of a target ${snapshot.emergencyFundTargetMonths} months. Closing this gap is the highest-value use of surplus cash.`,
    );
  }

  // 3. Always keep something instantly reachable.
  const liquiditySlice = tidy(mulMinor(total, 0.125));
  push(
    AllocationBucket.LIQUID_RESERVE,
    (Math.min(liquiditySlice, remaining) as Minor),
    'A small instantly-accessible buffer avoids breaking longer-dated instruments for a minor surprise.',
  );

  // 4. Fund an active savings goal that is behind schedule.
  const laggingGoal = ctx.savingsGoals.find(
    (g) => g.currentAmount < g.targetAmount && g.monthlyContribution > 0,
  );
  if (laggingGoal && remaining > 0) {
    const need = toMinor(laggingGoal.targetAmount - laggingGoal.currentAmount);
    const slice = tidy(Math.min(need, mulMinor(remaining, 0.25)) as Minor);
    push(
      AllocationBucket.GOAL_FUNDING,
      slice,
      `"${laggingGoal.name}" still needs ${formatINR(laggingGoal.targetAmount - laggingGoal.currentAmount)}. Funding it now shortens the timeline.`,
    );
  }

  // 5. Split what is left by risk tolerance.
  const split = GROWTH_SPLIT[riskTolerance] ?? GROWTH_SPLIT.MODERATE;
  const leftover = clampNonNegative(remaining);
  const lowRisk = tidy(mulMinor(leftover, split.lowRisk));
  push(
    AllocationBucket.LOW_RISK,
    lowRisk,
    `Matches a ${riskTolerance.toLowerCase()} risk profile: capital stability with a modest, predictable return.`,
  );
  const growth = clampNonNegative(remaining);
  push(
    AllocationBucket.LONG_TERM_GROWTH,
    growth,
    'Money you will not need for five or more years can absorb short-term volatility in exchange for higher expected long-run returns.',
  );

  return {
    surplusCash: fromMinor(total),
    suggestions,
    totalAllocated: round(
      suggestions.reduce((sum, s) => sum + s.amount, 0),
      2,
    ),
    disclaimer: ADVICE_DISCLAIMER,
    computedAt: snapshot.asOf,
  };
}

/**
 * Concrete, evidence-backed places the user could free up money. Every figure
 * comes from their own transactions — nothing is generic advice.
 */
export function findSavingsOpportunities(
  ctx: EngineContext,
  snapshot: FinancialSnapshot,
  internals: SnapshotInternals,
): SavingsOpportunity[] {
  const opportunities: SavingsOpportunity[] = [];
  const completed = internals.monthlyAggregates.filter((a) => a.month !== internals.period.key);

  // Categories running above their allocation.
  for (const category of snapshot.categoryBreakdown) {
    if (category.categoryKind !== CategoryKind.DISCRETIONARY) continue;
    if (category.allocated <= 0 || category.spent <= category.allocated) continue;
    const overage = category.spent - category.allocated;
    opportunities.push({
      key: `over_budget_${category.categoryKey}`,
      title: `Bring ${category.categoryLabel} back to its budget`,
      monthlySaving: round(overage, 2),
      annualSaving: round(overage * 12, 2),
      confidence: 90,
      evidence: `You have spent ${formatINR(category.spent)} against a ${formatINR(category.allocated)} allocation across ${category.transactionCount} transactions.`,
      categoryKey: category.categoryKey,
    });
  }

  // Subscription creep — recurring debits that keep growing.
  const subscriptionSpend = snapshot.categoryBreakdown.find((c) => c.categoryKey === 'subscriptions');
  if (subscriptionSpend && subscriptionSpend.spent > 0) {
    const recurringSubs = ctx.transactions.filter(
      (t) => t.categoryKey === 'subscriptions' && t.isRecurring && t.direction === 'DEBIT',
    );
    const distinctMerchants = new Set(recurringSubs.map((t) => t.merchantName ?? t.description));
    if (distinctMerchants.size >= 3) {
      const trimmable = subscriptionSpend.spent * 0.3;
      opportunities.push({
        key: 'subscription_audit',
        title: `Audit ${distinctMerchants.size} active subscriptions`,
        monthlySaving: round(trimmable, 2),
        annualSaving: round(trimmable * 12, 2),
        confidence: 65,
        evidence: `${distinctMerchants.size} recurring subscriptions cost ${formatINR(subscriptionSpend.spent)} this month. Cancelling the least-used third would free roughly ${formatINR(trimmable)}.`,
        categoryKey: 'subscriptions',
      });
    }
  }

  // Discretionary spend running above the user's own 3-month baseline.
  if (completed.length >= 2) {
    const baseline = mean(completed.slice(-3).map((a) => a.discretionary));
    const current = internals.actual.wants;
    const pacedCurrent =
      current * (snapshot.period.totalDays / Math.max(snapshot.period.daysElapsed, 1));
    if (baseline > 0 && pacedCurrent > baseline * 1.15) {
      const excess = (pacedCurrent - baseline) as Minor;
      opportunities.push({
        key: 'discretionary_pace',
        title: 'Return discretionary spending to your own average',
        monthlySaving: round(fromMinor(Math.round(excess) as Minor), 2),
        annualSaving: round(fromMinor(Math.round(excess * 12) as Minor), 2),
        confidence: 75,
        evidence: `At the current pace you will spend ${formatINR(fromMinor(Math.round(pacedCurrent) as Minor))} on wants this month against a ${formatINR(fromMinor(Math.round(baseline) as Minor))} three-month average.`,
        categoryKey: null,
      });
    }
  }

  return opportunities.sort((a, b) => b.annualSaving - a.annualSaving).slice(0, 6);
}
