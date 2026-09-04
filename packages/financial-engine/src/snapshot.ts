import {
  CATEGORY_BY_KEY,
  CategoryKind,
  DEFAULT_CURRENCY,
  ENGINE_VERSION,
  type CashFlowPoint,
  type CategorySpend,
  type EngineContext,
  type EngineTransaction,
  type FinancialSnapshot,
  type Minor,
  ZERO,
  addMinor,
  categoryLabel,
  clamp,
  clampNonNegative,
  fromMinor,
  minMinor,
  mulMinor,
  presetFor,
  round,
  safeRatio,
  toMinor,
  toPercent,
} from '@flowmoney/shared-types';
import {
  aggregateByMonth,
  debitsOfKind,
  isSpendKind,
  mean,
  standardDeviation,
  sumWhere,
  type MonthlyAggregate,
} from './aggregate';
import { buildPeriod, dayInPeriod, isWithin, monthKeyOf, type Period } from './period';

/**
 * Values the public snapshot does not expose but downstream engines need, kept
 * in exact minor units so no precision is lost between stages.
 */
export interface SnapshotInternals {
  period: Period;
  asOf: Date;
  monthlyAggregates: MonthlyAggregate[];
  currentMonth: MonthlyAggregate;
  /** Baseline monthly essential spend — the denominator for emergency-fund months. */
  essentialMonthlyBaseline: Minor;
  monthlyIncome: Minor;
  availableSpendable: Minor;
  /**
   * Cash left once every known bill this month is paid, but *before* the
   * emergency reserve is protected. This is what a purchase is physically
   * funded from; `safelySpendableCash` additionally respects the reserve.
   */
  cashAfterObligations: Minor;
  emergencyFundBalance: Minor;
  reserveRequirement: Minor;
  safelySpendableCash: Minor;
  discretionaryBudget: Minor;
  discretionaryBudgetRemaining: Minor;
  savingsTarget: Minor;
  projectedSavings: Minor;
  projectedMonthEndSpend: Minor;
  upcomingObligationsRemaining: Minor;
  planned: {
    needs: Minor;
    wants: Minor;
    savings: Minor;
    investments: Minor;
    debt: Minor;
  };
  actual: {
    needs: Minor;
    wants: Minor;
    savings: Minor;
    investments: Minor;
    debt: Minor;
  };
  /** 0..1 — how much history backs these numbers. Drives decision confidence. */
  dataQuality: {
    monthsOfHistory: number;
    transactionCount: number;
    hasBudget: boolean;
    incomeObserved: boolean;
    score: number;
  };
}

export interface SnapshotResult {
  snapshot: FinancialSnapshot;
  internals: SnapshotInternals;
}

/** An obligation that has not yet been settled this period. */
interface PendingObligation {
  label: string;
  amount: Minor;
  dueDate: Date;
  categoryKind: CategoryKind;
}

/**
 * A recurring obligation counts as settled when a posted transaction in the
 * same category, within 10% of the expected amount, already exists this period.
 * Without this check rent would be reserved twice in the second half of a month.
 */
function findPendingObligations(
  ctx: EngineContext,
  periodTransactions: EngineTransaction[],
  period: Period,
): PendingObligation[] {
  const pending: PendingObligation[] = [];

  for (const obligation of ctx.recurringObligations) {
    const expected = toMinor(obligation.amount);
    if (expected <= 0) continue;

    const settled = periodTransactions.some((txn) => {
      if (txn.direction !== 'DEBIT') return false;
      if (txn.categoryKey !== obligation.categoryKey) return false;
      const actual = toMinor(txn.amount);
      return Math.abs(actual - expected) <= Math.max(mulMinor(expected, 0.1), toMinor(50));
    });
    if (settled) continue;

    const dueDate = dayInPeriod(period, obligation.dueDay);
    pending.push({
      label: obligation.label,
      amount: expected,
      dueDate,
      categoryKind: obligation.categoryKind,
    });
  }

  return pending.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

function resolveMonthlyIncome(
  ctx: EngineContext,
  aggregates: MonthlyAggregate[],
  currentMonthKey: string,
): { income: Minor; observed: boolean } {
  // Completed months only — the in-flight month understates income.
  const completed = aggregates.filter((a) => a.month !== currentMonthKey && a.income > 0);
  const trailing = completed.slice(-3);

  if (trailing.length >= 2) {
    const avg = Math.round(mean(trailing.map((a) => a.income)));
    return { income: avg as Minor, observed: true };
  }

  if (ctx.budget && ctx.budget.monthlyIncome > 0) {
    return { income: toMinor(ctx.budget.monthlyIncome), observed: false };
  }
  if (ctx.declaredMonthlyIncome && ctx.declaredMonthlyIncome > 0) {
    return { income: toMinor(ctx.declaredMonthlyIncome), observed: false };
  }
  if (trailing.length === 1) {
    return { income: (trailing[0]?.income ?? ZERO) as Minor, observed: true };
  }
  const current = aggregates.find((a) => a.month === currentMonthKey);
  return { income: (current?.income ?? ZERO) as Minor, observed: Boolean(current?.income) };
}

function buildCategoryBreakdown(
  ctx: EngineContext,
  periodTransactions: EngineTransaction[],
): CategorySpend[] {
  const allocations = new Map<string, Minor>();
  for (const allocation of ctx.budget?.allocations ?? []) {
    allocations.set(allocation.categoryKey, toMinor(allocation.allocated));
  }

  const spend = new Map<string, { amount: Minor; count: number }>();
  for (const txn of periodTransactions) {
    if (txn.isPending || txn.direction !== 'DEBIT') continue;
    if (txn.categoryKind === CategoryKind.TRANSFER) continue;
    const entry = spend.get(txn.categoryKey) ?? { amount: ZERO, count: 0 };
    entry.amount = addMinor(entry.amount, toMinor(txn.amount));
    entry.count += 1;
    spend.set(txn.categoryKey, entry);
  }

  const keys = new Set<string>([...allocations.keys(), ...spend.keys()]);
  const rows: CategorySpend[] = [];

  for (const key of keys) {
    const allocated = allocations.get(key) ?? ZERO;
    const entry = spend.get(key) ?? { amount: ZERO, count: 0 };
    const remaining = (allocated - entry.amount) as Minor;
    rows.push({
      categoryKey: key,
      categoryLabel: categoryLabel(key),
      categoryKind: CATEGORY_BY_KEY[key]?.kind ?? CategoryKind.DISCRETIONARY,
      spent: fromMinor(entry.amount),
      allocated: fromMinor(allocated),
      remaining: fromMinor(remaining),
      utilisationPercent: allocated > 0 ? toPercent(safeRatio(entry.amount, allocated)) : 0,
      transactionCount: entry.count,
    });
  }

  return rows.sort((a, b) => b.spent - a.spent);
}

function buildDailyCashFlow(
  periodTransactions: EngineTransaction[],
  period: Period,
  closingBalance: Minor,
): CashFlowPoint[] {
  const inflows = new Map<number, number>();
  const outflows = new Map<number, number>();

  for (const txn of periodTransactions) {
    if (txn.isPending) continue;
    const day = new Date(txn.occurredAt).getUTCDate();
    const amount = toMinor(txn.amount);
    if (txn.direction === 'CREDIT') {
      inflows.set(day, (inflows.get(day) ?? 0) + amount);
    } else {
      outflows.set(day, (outflows.get(day) ?? 0) + amount);
    }
  }

  // Walk backwards from today's closing balance to reconstruct the opening
  // balance, then forwards so the series ends on the real current balance.
  let netToDate = 0;
  for (let day = 1; day <= period.daysElapsed; day += 1) {
    netToDate += (inflows.get(day) ?? 0) - (outflows.get(day) ?? 0);
  }
  let running = closingBalance - netToDate;

  const points: CashFlowPoint[] = [];
  for (let day = 1; day <= period.daysElapsed; day += 1) {
    const inflow = inflows.get(day) ?? 0;
    const outflow = outflows.get(day) ?? 0;
    running += inflow - outflow;
    points.push({
      date: dayInPeriod(period, day).toISOString().slice(0, 10),
      inflow: fromMinor(inflow as Minor),
      outflow: fromMinor(outflow as Minor),
      net: fromMinor((inflow - outflow) as Minor),
      runningBalance: fromMinor(running as Minor),
    });
  }
  return points;
}

/**
 * Builds the canonical financial position for a user. Pure: identical input
 * always yields identical output, which is what makes stored decisions
 * reproducible and auditable.
 */
export function buildSnapshot(ctx: EngineContext): SnapshotResult {
  const asOf = new Date(ctx.asOf);
  const period = buildPeriod(asOf);
  const currency = ctx.currency || DEFAULT_CURRENCY;

  const periodTransactions = ctx.transactions.filter((t) =>
    isWithin(new Date(t.occurredAt), period.start, period.end),
  );

  const aggregateMap = aggregateByMonth(ctx.transactions);
  const monthlyAggregates = [...aggregateMap.values()].sort((a, b) => a.month.localeCompare(b.month));
  const currentMonth =
    aggregateMap.get(period.key) ??
    ({
      month: period.key,
      income: ZERO,
      essential: ZERO,
      discretionary: ZERO,
      debt: ZERO,
      savings: ZERO,
      investment: ZERO,
      totalSpend: ZERO,
      net: ZERO,
      transactionCount: 0,
    } as MonthlyAggregate);

  // ---------------------------------------------------------------- balances
  const spendableAccounts = ctx.accounts.filter((a) => !a.isLiability && !isEmergencyAccount(a));
  const emergencyAccounts = ctx.accounts.filter((a) => !a.isLiability && isEmergencyAccount(a));
  const liabilityAccounts = ctx.accounts.filter((a) => a.isLiability);

  const availableSpendable = sumAccounts(spendableAccounts, 'availableBalance');
  const totalLiquid = addMinor(
    sumAccounts(spendableAccounts, 'balance'),
    sumAccounts(emergencyAccounts, 'balance'),
  );
  const liabilitiesOutstanding = sumAccounts(liabilityAccounts, 'balance');
  const totalBalance = totalLiquid;
  const availableBalance = addMinor(
    availableSpendable,
    sumAccounts(emergencyAccounts, 'availableBalance'),
  );
  const netWorth = (totalLiquid - liabilitiesOutstanding + toMinor(ctx.portfolioValue)) as Minor;

  // ------------------------------------------------------------------ income
  const { income: monthlyIncome, observed: incomeObserved } = resolveMonthlyIncome(
    ctx,
    monthlyAggregates,
    period.key,
  );
  const incomeReceived = currentMonth.income;
  const incomeExpectedRemaining = clampNonNegative(monthlyIncome - incomeReceived);

  // --------------------------------------------------------------- spending
  const essentialSpent = currentMonth.essential;
  const discretionarySpent = currentMonth.discretionary;
  const debtPaid = currentMonth.debt;
  const savedThisPeriod = currentMonth.savings;
  const investedThisPeriod = addMinor(currentMonth.investment, toMinor(ctx.investmentContributionsThisMonth));
  const totalSpentThisPeriod = currentMonth.totalSpend;

  // -------------------------------------------------------------- baselines
  const completedMonths = monthlyAggregates.filter((a) => a.month !== period.key);
  const trailingEssential = completedMonths.slice(-3).map((a) => a.essential);
  const observedEssentialBaseline = trailingEssential.length
    ? Math.round(mean(trailingEssential))
    : 0;

  // --------------------------------------------------------------- envelopes
  const preset = ctx.budget ? presetFor(ctx.budget.strategy) : presetFor('BALANCED');
  const needsPercent = ctx.budget?.needsPercent ?? preset.needsPercent;
  const wantsPercent = ctx.budget?.wantsPercent ?? preset.wantsPercent;
  const savingsPercent = ctx.budget?.savingsPercent ?? preset.savingsPercent;
  const investmentsPercent = ctx.budget?.investmentsPercent ?? preset.investmentsPercent;
  const debtPercent = ctx.budget?.debtPercent ?? preset.debtPercent;

  const plannedNeeds = mulMinor(monthlyIncome, needsPercent / 100);
  const plannedWants = mulMinor(monthlyIncome, wantsPercent / 100);
  const plannedSavings = mulMinor(monthlyIncome, savingsPercent / 100);
  const plannedInvestments = mulMinor(monthlyIncome, investmentsPercent / 100);
  const plannedDebt = mulMinor(monthlyIncome, debtPercent / 100);

  // Explicit per-category allocations win over the percentage split when the
  // user has configured them — they are the more specific intent.
  const discretionaryAllocations = (ctx.budget?.allocations ?? []).filter(
    (a) => a.categoryKind === CategoryKind.DISCRETIONARY,
  );
  const allocatedDiscretionary = discretionaryAllocations.reduce<number>(
    (sum, a) => sum + toMinor(a.allocated),
    0,
  ) as Minor;
  const discretionaryBudget = allocatedDiscretionary > 0 ? allocatedDiscretionary : plannedWants;
  const discretionaryBudgetRemaining = clampNonNegative(discretionaryBudget - discretionarySpent);

  // Baseline essential spend drives emergency-fund cover. Observed behaviour
  // beats the plan: what the user *actually* needs each month is the honest
  // denominator. The planned envelope is only a fallback for new users.
  const essentialMonthlyBaseline = (Math.max(
    observedEssentialBaseline > 0
      ? Math.max(observedEssentialBaseline, essentialSpent)
      : Math.max(plannedNeeds, essentialSpent),
    toMinor(1),
  ) || toMinor(1)) as Minor;

  // ------------------------------------------------------------- obligations
  const pendingObligations = findPendingObligations(ctx, periodTransactions, period);
  const upcomingObligationsRemaining = pendingObligations.reduce<number>(
    (sum, o) => sum + o.amount,
    0,
  ) as Minor;
  const upcomingRecurringPayments = upcomingObligationsRemaining;
  const committedEssentialRemaining = pendingObligations
    .filter((o) => o.categoryKind === CategoryKind.ESSENTIAL || o.categoryKind === CategoryKind.DEBT)
    .reduce<number>((sum, o) => sum + o.amount, 0) as Minor;

  // Variable essentials (groceries, fuel) are projected, never taken from the
  // recurring list.
  const variableEssentialSpent = sumWhere(
    periodTransactions,
    (t) => debitsOfKind(CategoryKind.ESSENTIAL)(t) && !t.isRecurring,
  );
  const historicalVariableEssential = averageNonRecurringPerMonth(
    ctx.transactions,
    period.key,
    (t) => t.categoryKind === CategoryKind.ESSENTIAL,
  );
  const variableEssentialRemaining = projectRemaining(
    variableEssentialSpent,
    period,
    historicalVariableEssential,
  );
  const essentialExpensesRemaining = addMinor(
    committedEssentialRemaining,
    variableEssentialRemaining,
  );

  // ---------------------------------------------------------- emergency fund
  const emergencyAccountBalance = sumAccounts(emergencyAccounts, 'balance');
  const configuredReserve =
    ctx.emergencyReserveAmount != null && ctx.emergencyReserveAmount > 0
      ? toMinor(ctx.emergencyReserveAmount)
      : mulMinor(essentialMonthlyBaseline, ctx.emergencyFundTargetMonths);
  const reserveRequirement = configuredReserve;
  // What the user actually holds against that requirement: a dedicated account
  // if they have one, otherwise the portion of liquid cash it represents.
  const emergencyFundBalance =
    emergencyAccountBalance > 0
      ? emergencyAccountBalance
      : minMinor(totalLiquid, reserveRequirement);
  const reserveHeldInSpendable = clampNonNegative(reserveRequirement - emergencyAccountBalance);
  const emergencyFundMonths = round(safeRatio(emergencyFundBalance, essentialMonthlyBaseline), 2);

  const cashAfterObligations = (availableSpendable - upcomingObligationsRemaining) as Minor;
  const safelySpendableCash = (cashAfterObligations - reserveHeldInSpendable) as Minor;

  // ---------------------------------------------------------------- savings
  const savingsTarget = plannedSavings;
  const savingsProgress = savedThisPeriod;
  const savingsShortfall = clampNonNegative(savingsTarget - savingsProgress);

  // ------------------------------------------------------------ projections
  const nonRecurringSpend = sumWhere(
    periodTransactions,
    (t) => t.direction === 'DEBIT' && isSpendKind(t.categoryKind) && !t.isRecurring,
  );
  const burnRatePerDay = safeRatio(nonRecurringSpend, period.daysElapsed);
  const historicalNonRecurring = averageNonRecurringPerMonth(ctx.transactions, period.key, (t) =>
    isSpendKind(t.categoryKind),
  );
  const projectedVariableRemaining = projectRemaining(
    nonRecurringSpend,
    period,
    historicalNonRecurring,
  );
  const projectedMonthEndSpend = addMinor(
    totalSpentThisPeriod,
    projectedVariableRemaining,
    pendingObligations
      .filter((o) => isSpendKind(o.categoryKind))
      .reduce<number>((sum, o) => sum + o.amount, 0),
  );
  const projectedSavings = (monthlyIncome - projectedMonthEndSpend - investedThisPeriod) as Minor;
  const projectedSavingsRatePercent = toPercent(safeRatio(projectedSavings, monthlyIncome));
  const currentSavingsRatePercent = toPercent(safeRatio(savedThisPeriod, monthlyIncome));

  // --------------------------------------------------------------- adherence
  const overspend =
    Math.max(0, essentialSpent - plannedNeeds) +
    Math.max(0, discretionarySpent - plannedWants) +
    (plannedDebt > 0 ? Math.max(0, debtPaid - plannedDebt) : 0);
  const plannedTotalSpend = Math.max(addMinor(plannedNeeds, plannedWants, plannedDebt), toMinor(1));
  const budgetAdherencePercent = round(
    Math.min(100, Math.max(0, 100 * (1 - safeRatio(overspend, plannedTotalSpend)))),
    2,
  );

  // ------------------------------------------------------------------- debt
  const monthlyDebtPayments = (toMinor(ctx.monthlyDebtPayments) || debtPaid) as Minor;
  const debtToIncomeRatioPercent = toPercent(safeRatio(monthlyDebtPayments, monthlyIncome));

  // ------------------------------------------------------------- data quality
  const monthsOfHistory = monthlyAggregates.length;
  const dataQualityScore = round(
    Math.min(
      1,
      0.35 * Math.min(monthsOfHistory / 3, 1) +
        0.3 * Math.min(ctx.transactions.length / 60, 1) +
        0.2 * (ctx.budget ? 1 : 0) +
        0.15 * (incomeObserved ? 1 : 0),
    ),
    4,
  );

  const dailyCashFlow = buildDailyCashFlow(periodTransactions, period, totalBalance);
  const averageDailyDiscretionarySpend = safeRatio(discretionarySpent, period.daysElapsed);
  const runwayDays =
    burnRatePerDay > 0 ? round(safeRatio(Math.max(safelySpendableCash, 0), burnRatePerDay), 1) : 999;

  const snapshot: FinancialSnapshot = {
    userId: ctx.userId,
    asOf: asOf.toISOString(),
    currency,
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      daysElapsed: period.daysElapsed,
      daysRemaining: period.daysRemaining,
      totalDays: period.totalDays,
    },

    totalBalance: fromMinor(totalBalance),
    availableBalance: fromMinor(availableBalance),
    liabilitiesOutstanding: fromMinor(liabilitiesOutstanding),
    netWorth: fromMinor(netWorth),

    monthlyIncome: fromMinor(monthlyIncome),
    incomeReceivedThisPeriod: fromMinor(incomeReceived),
    incomeExpectedRemaining: fromMinor(incomeExpectedRemaining),

    totalSpentThisPeriod: fromMinor(totalSpentThisPeriod),
    essentialSpent: fromMinor(essentialSpent),
    discretionarySpent: fromMinor(discretionarySpent),
    debtPaidThisPeriod: fromMinor(debtPaid),
    savedThisPeriod: fromMinor(savedThisPeriod),
    investedThisPeriod: fromMinor(investedThisPeriod),

    essentialExpensesRemaining: fromMinor(essentialExpensesRemaining),
    upcomingRecurringPayments: fromMinor(upcomingRecurringPayments),
    upcomingObligations: pendingObligations.map((o) => ({
      label: o.label,
      amount: fromMinor(o.amount),
      dueDate: o.dueDate.toISOString(),
    })),

    discretionaryBudget: fromMinor(discretionaryBudget),
    discretionaryBudgetRemaining: fromMinor(discretionaryBudgetRemaining),
    savingsTarget: fromMinor(savingsTarget),
    savingsProgress: fromMinor(savingsProgress),
    savingsShortfall: fromMinor(savingsShortfall),
    budgetAdherencePercent,
    projectedMonthEndSpend: fromMinor(projectedMonthEndSpend),
    projectedSavings: fromMinor(projectedSavings),
    projectedSavingsRatePercent,
    currentSavingsRatePercent,

    emergencyFundBalance: fromMinor(emergencyFundBalance),
    emergencyFundTargetMonths: ctx.emergencyFundTargetMonths,
    emergencyFundMonths,
    emergencyReserveAmount: fromMinor(reserveRequirement),
    safelySpendableCash: fromMinor(safelySpendableCash),

    monthlyDebtPayments: fromMinor(monthlyDebtPayments),
    totalDebtOutstanding: ctx.totalDebtOutstanding,
    debtToIncomeRatioPercent,

    categoryBreakdown: buildCategoryBreakdown(ctx, periodTransactions),
    dailyCashFlow,
    averageDailyDiscretionarySpend: round(fromMinor(averageDailyDiscretionarySpend as Minor), 2),
    burnRatePerDay: round(fromMinor(burnRatePerDay as Minor), 2),
    runwayDays,
  };

  const internals: SnapshotInternals = {
    period,
    asOf,
    monthlyAggregates,
    currentMonth,
    essentialMonthlyBaseline,
    monthlyIncome,
    availableSpendable,
    cashAfterObligations,
    emergencyFundBalance,
    reserveRequirement,
    safelySpendableCash,
    discretionaryBudget,
    discretionaryBudgetRemaining,
    savingsTarget,
    projectedSavings,
    projectedMonthEndSpend,
    upcomingObligationsRemaining,
    planned: {
      needs: plannedNeeds,
      wants: plannedWants,
      savings: plannedSavings,
      investments: plannedInvestments,
      debt: plannedDebt,
    },
    actual: {
      needs: essentialSpent,
      wants: discretionarySpent,
      savings: savedThisPeriod,
      investments: investedThisPeriod,
      debt: debtPaid,
    },
    dataQuality: {
      monthsOfHistory,
      transactionCount: ctx.transactions.length,
      hasBudget: Boolean(ctx.budget),
      incomeObserved,
      score: dataQualityScore,
    },
  };

  return { snapshot, internals };
}

export function computeSnapshot(ctx: EngineContext): FinancialSnapshot {
  return buildSnapshot(ctx).snapshot;
}

export const SNAPSHOT_ENGINE_VERSION = ENGINE_VERSION;

// ------------------------------------------------------------------ helpers

/**
 * Average monthly non-recurring spend across completed months, used as the
 * prior for month-end projections.
 */
function averageNonRecurringPerMonth(
  transactions: EngineTransaction[],
  currentMonthKey: string,
  predicate: (t: EngineTransaction) => boolean,
): Minor {
  const byMonth = new Map<string, number>();
  for (const txn of transactions) {
    if (txn.isPending || txn.direction !== 'DEBIT' || txn.isRecurring) continue;
    if (!predicate(txn)) continue;
    const month = monthKeyOf(new Date(txn.occurredAt));
    if (month === currentMonthKey) continue;
    byMonth.set(month, (byMonth.get(month) ?? 0) + toMinor(txn.amount));
  }
  if (byMonth.size === 0) return ZERO;
  return Math.round(mean([...byMonth.values()])) as Minor;
}

/**
 * Projects the rest of the month's variable spending.
 *
 * Naive extrapolation (spend-so-far ÷ days-elapsed × days-remaining) is wildly
 * unstable in the first week: one large purchase on the 2nd implies an absurd
 * month. So the observed pace is blended with the user's own historical monthly
 * average, weighted by how much of the month has actually been observed. By the
 * end of the month the projection is almost entirely the real pace.
 */
function projectRemaining(
  spentSoFar: Minor,
  period: Period,
  historicalMonthlyAverage: Minor,
): Minor {
  const paceProjection = safeRatio(spentSoFar, period.daysElapsed) * period.totalDays;
  if (historicalMonthlyAverage <= 0) {
    return clampNonNegative(Math.round(paceProjection) - spentSoFar);
  }
  const confidence = clamp(period.daysElapsed / period.totalDays, 0, 1);
  const blendedTotal =
    confidence * paceProjection + (1 - confidence) * historicalMonthlyAverage;
  return clampNonNegative(Math.round(blendedTotal) - spentSoFar);
}

// ------------------------------------------------------------------ helpers

function isEmergencyAccount(account: { isEmergencyFund: boolean }): boolean {
  return account.isEmergencyFund;
}

function sumAccounts(
  accounts: Array<{ balance: number; availableBalance: number }>,
  field: 'balance' | 'availableBalance',
): Minor {
  return accounts.reduce<number>((sum, a) => sum + toMinor(a[field]), 0) as Minor;
}

export { monthKeyOf, standardDeviation };
