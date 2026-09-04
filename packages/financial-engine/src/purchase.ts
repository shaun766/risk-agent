import {
  DECISION_GUARDRAILS,
  ENGINE_VERSION,
  OPPORTUNITY_COST,
  PURCHASE_FACTOR_WEIGHTS,
  PurchaseVerdict,
  RiskLevel,
  VERDICT_THRESHOLDS,
  categoryLabel,
  clamp,
  clampNonNegative,
  formatINR,
  fromMinor,
  type DecisionFactor,
  type FinancialSnapshot,
  type Minor,
  type PurchaseDecision,
  type PurchaseFactorKey,
  type PurchaseRequest,
  round,
  safeRatio,
  toMinor,
  toPercent,
} from '@flowmoney/shared-types';
import { computeFinancialHealth } from './health';
import type { SnapshotInternals } from './snapshot';

const DEFAULT_IMPORTANCE = 3;

/** Linear score that is 100 at or below `best` and 0 at or above `worst`. */
function gradeDescending(value: number, best: number, worst: number): number {
  if (!Number.isFinite(value)) return 0;
  if (worst <= best) return value <= best ? 100 : 0;
  if (value <= best) return 100;
  if (value >= worst) return 0;
  return round(100 * (1 - (value - best) / (worst - best)), 2);
}

function factor(
  key: PurchaseFactorKey,
  label: string,
  score: number,
  detail: string,
  inputs: Record<string, number>,
): DecisionFactor {
  const weight = PURCHASE_FACTOR_WEIGHTS[key];
  const bounded = round(clamp(score, 0, 100), 2);
  return {
    key,
    label,
    score: bounded,
    weight,
    contribution: round(bounded * weight, 2),
    detail,
    inputs,
  };
}

function verdictForScore(score: number): PurchaseVerdict {
  for (const band of VERDICT_THRESHOLDS) {
    if (score >= band.min) return band.verdict;
  }
  return PurchaseVerdict.NOT_RECOMMENDED;
}

function cashFlowRiskLevel(bufferMonths: number): RiskLevel {
  if (bufferMonths >= 1) return RiskLevel.LOW;
  if (bufferMonths >= 0.5) return RiskLevel.MODERATE;
  if (bufferMonths >= 0) return RiskLevel.HIGH;
  return RiskLevel.CRITICAL;
}

/** Round a suggested contribution to a memorable figure (nearest ₹500). */
function roundContribution(value: Minor): Minor {
  const step = toMinor(500);
  return (Math.max(step, Math.round(value / step) * step)) as Minor;
}

export interface EvaluatePurchaseArgs {
  snapshot: FinancialSnapshot;
  internals: SnapshotInternals;
  request: PurchaseRequest;
}

/**
 * The purchase decision engine.
 *
 * Seven weighted factors produce a 0–100 affordability score, which is then
 * passed through hard guardrails: no matter how well a purchase scores on
 * softer dimensions, spending money the user does not safely have cannot be
 * graded as affordable. Every intermediate number is returned so the LLM can
 * explain the decision without ever inventing a figure.
 */
export function evaluatePurchase({
  snapshot,
  internals,
  request,
}: EvaluatePurchaseArgs): PurchaseDecision {
  const price = toMinor(request.price);
  const importance = clamp(request.importance ?? DEFAULT_IMPORTANCE, 1, 5);

  const safelySpendable = internals.safelySpendableCash;
  const cashAfterObligations = internals.cashAfterObligations;
  const discretionaryRemaining = internals.discretionaryBudgetRemaining;
  const monthlyIncome = internals.monthlyIncome;
  const essentialBaseline = internals.essentialMonthlyBaseline;

  // ------------------------------------------------------------- factor 1/7
  // Measured against cash left after this month's bills. The emergency reserve
  // is handled by its own factor — folding it in here would zero this dimension
  // permanently for anyone who is temporarily under-reserved.
  const cashRatio =
    cashAfterObligations > 0 ? safeRatio(price, cashAfterObligations) : Number.POSITIVE_INFINITY;
  const cashAvailability = factor(
    'cashAvailability',
    'Cash availability',
    cashAfterObligations <= 0 ? 0 : gradeDescending(cashRatio, 0.25, 1),
    cashAfterObligations <= 0
      ? 'You have no cash left once this month\u2019s committed payments are covered.'
      : `This purchase uses ${toPercent(cashRatio)}% of the ${formatINR(fromMinor(cashAfterObligations))} you hold after this month\u2019s bills.`,
    {
      cashAfterObligations: fromMinor(cashAfterObligations),
      safelySpendableCash: fromMinor(safelySpendable),
      purchasePrice: fromMinor(price),
      ratioPercent: cashAfterObligations > 0 ? toPercent(cashRatio) : 0,
    },
  );

  // ------------------------------------------------------------- factor 2/7
  const budgetRatio =
    discretionaryRemaining > 0 ? safeRatio(price, discretionaryRemaining) : Number.POSITIVE_INFINITY;
  const budgetCompatibility = factor(
    'budgetCompatibility',
    'Budget compatibility',
    discretionaryRemaining <= 0 ? 0 : gradeDescending(budgetRatio, 0.5, 1.5),
    discretionaryRemaining <= 0
      ? 'Your discretionary budget for this month is already fully used.'
      : `It consumes ${toPercent(budgetRatio)}% of the ${formatINR(fromMinor(discretionaryRemaining))} left in your discretionary budget.`,
    {
      discretionaryBudgetRemaining: fromMinor(discretionaryRemaining),
      purchasePrice: fromMinor(price),
      ratioPercent: discretionaryRemaining > 0 ? toPercent(budgetRatio) : 0,
    },
  );

  // ------------------------------------------------------------- factor 3/7
  // Spending inside the discretionary envelope does not damage savings — only
  // the overage does. This mirrors how the budget is actually constructed.
  const budgetOverage = clampNonNegative(price - discretionaryRemaining);
  const projectedSavingsBefore = internals.projectedSavings;
  const projectedSavingsAfter = (projectedSavingsBefore - budgetOverage) as Minor;
  const savingsTarget = internals.savingsTarget;
  const savingsAchievement =
    savingsTarget > 0 ? safeRatio(projectedSavingsAfter, savingsTarget) : 1;
  const savingsImpact = factor(
    'savingsImpact',
    'Savings impact',
    savingsTarget <= 0 ? 70 : clamp(savingsAchievement * 100, 0, 100),
    budgetOverage > 0
      ? `Spending ${formatINR(fromMinor(budgetOverage))} beyond your budget takes projected savings from ${formatINR(fromMinor(projectedSavingsBefore))} to ${formatINR(fromMinor(projectedSavingsAfter))}.`
      : 'This purchase fits inside your discretionary budget, so your savings plan is unaffected.',
    {
      savingsTarget: fromMinor(savingsTarget),
      projectedSavingsBefore: fromMinor(projectedSavingsBefore),
      projectedSavingsAfter: fromMinor(projectedSavingsAfter),
      budgetOverage: fromMinor(budgetOverage),
    },
  );

  // ------------------------------------------------------------- factor 4/7
  const cashAfter = (safelySpendable - price) as Minor;
  const reserveBreached = cashAfter < 0;
  const emergencyFundAfter = reserveBreached
    ? clampNonNegative(internals.emergencyFundBalance + cashAfter)
    : internals.emergencyFundBalance;
  const emergencyMonthsAfter = round(safeRatio(emergencyFundAfter, essentialBaseline), 2);
  const targetMonths = snapshot.emergencyFundTargetMonths || 6;
  const emergencyFundSafety = factor(
    'emergencyFundSafety',
    'Emergency fund safety',
    clamp(safeRatio(emergencyMonthsAfter, targetMonths) * 100, 0, 100),
    reserveBreached
      ? `This purchase dips ${formatINR(fromMinor((-cashAfter) as Minor))} into your protected reserve, leaving ${emergencyMonthsAfter} months of cover.`
      : `Your emergency fund stays at ${snapshot.emergencyFundMonths} months of essential expenses.`,
    {
      monthsBefore: snapshot.emergencyFundMonths,
      monthsAfter: emergencyMonthsAfter,
      targetMonths,
      reserveShortfall: reserveBreached ? fromMinor((-cashAfter) as Minor) : 0,
    },
  );

  // ------------------------------------------------------------- factor 5/7
  const liquidityAfter = (internals.availableSpendable -
    price +
    toMinor(snapshot.incomeExpectedRemaining) -
    internals.upcomingObligationsRemaining) as Minor;
  const bufferMonths = round(safeRatio(liquidityAfter, essentialBaseline), 2);
  const cashFlowRisk = factor(
    'cashFlowRisk',
    'Cash flow risk',
    clamp(bufferMonths * 100, 0, 100),
    `After this purchase and all known bills you would hold ${formatINR(fromMinor(liquidityAfter))} — about ${bufferMonths} months of essential expenses.`,
    {
      liquidityAfter: fromMinor(liquidityAfter),
      bufferMonths,
      upcomingObligations: fromMinor(internals.upcomingObligationsRemaining),
    },
  );

  // ------------------------------------------------------------- factor 6/7
  // A recurring purchase is judged on its ongoing monthly load, not just today.
  const recurringMonthly = request.isRecurring ? toMinor(request.monthlyCost ?? 0) : 0;
  const effectiveDebtLoad = (toMinor(snapshot.monthlyDebtPayments) + recurringMonthly) as Minor;
  const dtiAfter = toPercent(safeRatio(effectiveDebtLoad, monthlyIncome));
  const debtBurden = factor(
    'debtBurden',
    'Debt & commitment burden',
    gradeDescending(dtiAfter, 10, 45),
    recurringMonthly > 0
      ? `Fixed commitments would reach ${dtiAfter}% of monthly income once this ${formatINR(fromMinor(recurringMonthly as Minor))}/month cost is added.`
      : snapshot.monthlyDebtPayments > 0
        ? `Existing debt payments are ${snapshot.debtToIncomeRatioPercent}% of monthly income.`
        : 'You carry no recurring debt commitments.',
    {
      currentDebtToIncomePercent: snapshot.debtToIncomeRatioPercent,
      debtToIncomeAfterPercent: dtiAfter,
      recurringMonthlyCost: fromMinor(recurringMonthly as Minor),
    },
  );

  // ------------------------------------------------------------- factor 7/7
  const purchaseImportance = factor(
    'purchaseImportance',
    'Purchase importance',
    ((importance - 1) / 4) * 100,
    `You rated this ${importance}/5 on necessity.`,
    { importance },
  );

  const factors = [
    cashAvailability,
    budgetCompatibility,
    savingsImpact,
    emergencyFundSafety,
    cashFlowRisk,
    debtBurden,
    purchaseImportance,
  ];

  let score = round(
    factors.reduce((sum, f) => sum + f.contribution, 0),
    2,
  );

  // ------------------------------------------------------------- guardrails
  const guardrailNotes: string[] = [];

  // Hard ceiling: money that is not there cannot be spent.
  if (cashAfterObligations <= 0 || price > cashAfterObligations) {
    if (score > DECISION_GUARDRAILS.cappedScoreWhenCashUnsafe) {
      score = DECISION_GUARDRAILS.cappedScoreWhenCashUnsafe;
    }
    guardrailNotes.push(
      'Purchase exceeds the cash left after this month\u2019s committed payments',
    );
  }

  // Soft ceiling: eroding the reserve, but only when the amount is material
  // relative to that reserve.
  const reserveMateriality = safeRatio(price, Math.max(internals.reserveRequirement, 1));
  if (
    reserveBreached &&
    reserveMateriality >= DECISION_GUARDRAILS.reserveMaterialityThreshold &&
    score > DECISION_GUARDRAILS.cappedScoreWhenReserveBreached
  ) {
    score = DECISION_GUARDRAILS.cappedScoreWhenReserveBreached;
    guardrailNotes.push('Purchase would draw down your protected emergency reserve');
  }
  if (
    monthlyIncome > 0 &&
    price > monthlyIncome * DECISION_GUARDRAILS.incomeMultipleForcingCaution &&
    score > DECISION_GUARDRAILS.cappedScoreWhenLargeVsIncome
  ) {
    score = DECISION_GUARDRAILS.cappedScoreWhenLargeVsIncome;
    guardrailNotes.push(
      `Purchase is more than ${DECISION_GUARDRAILS.incomeMultipleForcingCaution * 100}% of a month's income`,
    );
  }

  score = round(clamp(score, 0, 100), 2);
  const verdict = verdictForScore(score);

  // ------------------------------------------------------------- confidence
  const boundaryMargin = Math.min(
    ...VERDICT_THRESHOLDS.filter((b) => b.min > 0).map((b) => Math.abs(score - b.min)),
  );
  const confidence = round(
    clamp(
      100 * (0.55 + 0.35 * internals.dataQuality.score + 0.1 * clamp(boundaryMargin / 10, 0, 1)),
      0,
      100,
    ),
    0,
  );

  // ------------------------------------------------------------ what-if health
  const healthBefore = computeFinancialHealth(snapshot, internals);
  const savingsRateAfter = toPercent(safeRatio(projectedSavingsAfter, monthlyIncome));
  const healthAfter = computeFinancialHealth(snapshot, internals, {
    savingsRatePercent: savingsRateAfter,
    emergencyFundMonths: emergencyMonthsAfter,
    budgetAdherencePercent:
      discretionaryRemaining > 0 && price <= discretionaryRemaining
        ? snapshot.budgetAdherencePercent
        : round(
            clamp(
              snapshot.budgetAdherencePercent -
                100 * safeRatio(budgetOverage, Math.max(internals.planned.needs + internals.planned.wants, 1)),
              0,
              100,
            ),
            2,
          ),
    debtToIncomeRatioPercent: dtiAfter,
  });

  // ---------------------------------------------------------- opportunity cost
  const years = OPPORTUNITY_COST.defaultHorizonYears;
  const rate = OPPORTUNITY_COST.illustrativeAnnualRatePercent / 100;
  const futureValueMinor = Math.round(price * (1 + rate) ** years) as Minor;

  // -------------------------------------------------------------- saving plan
  // What the user could genuinely fund today: limited by both the discretionary
  // envelope and the cash left after bills. Being under-reserved is a caution
  // (handled by the guardrail), not a reason to claim they have nothing.
  const affordableNow = Math.max(0, Math.min(discretionaryRemaining, cashAfterObligations));
  const amountToAccumulate = clampNonNegative(price - affordableNow);
  const monthlyCapacity = roundContribution(
    Math.max(
      Math.round(internals.discretionaryBudget * 0.5),
      Math.round(monthlyIncome * 0.1),
      toMinor(500),
    ) as Minor,
  );
  const monthsToTarget = amountToAccumulate > 0 ? Math.ceil(amountToAccumulate / monthlyCapacity) : 0;
  const targetDate = new Date(internals.asOf);
  targetDate.setUTCMonth(targetDate.getUTCMonth() + Math.max(monthsToTarget, 0));

  const savingPlan =
    amountToAccumulate > 0
      ? {
          amountToAccumulate: fromMinor(amountToAccumulate),
          suggestedMonthlyContribution: fromMinor(monthlyCapacity),
          monthsToTarget,
          targetDate: targetDate.toISOString(),
        }
      : null;

  // ------------------------------------------------------------------ reasons
  const primaryReasons = buildReasons({
    verdict,
    guardrailNotes,
    price,
    discretionaryRemaining,
    budgetOverage,
    savingsTarget,
    projectedSavingsAfter,
    emergencyMonthsAfter,
    targetMonths,
    upcomingObligations: internals.upcomingObligationsRemaining,
    recurringMonthly: recurringMonthly as Minor,
  });

  const recommendedActions = buildActions({
    verdict,
    savingPlan,
    budgetOverage,
    category: request.category,
  });

  return {
    verdict,
    score,
    confidence,

    purchasePrice: fromMinor(price),
    category: request.category,
    merchant: request.merchant ?? null,

    availableBalance: snapshot.availableBalance,
    safelySpendableCash: fromMinor(safelySpendable),
    discretionaryBudgetRemaining: fromMinor(discretionaryRemaining),
    discretionaryBudgetAfter: fromMinor((discretionaryRemaining - price) as Minor),
    affordabilityGap: fromMinor((discretionaryRemaining - price) as Minor),
    budgetImpactPercentage: discretionaryRemaining > 0 ? toPercent(budgetRatio) : 0,

    essentialExpensesRemaining: snapshot.essentialExpensesRemaining,
    upcomingRecurringPayments: snapshot.upcomingRecurringPayments,
    incomeExpectedRemaining: snapshot.incomeExpectedRemaining,

    savingsTarget: fromMinor(savingsTarget),
    projectedSavingsBeforePurchase: fromMinor(projectedSavingsBefore),
    projectedSavingsAfterPurchase: fromMinor(projectedSavingsAfter),
    projectedSavingsRateBefore: snapshot.projectedSavingsRatePercent,
    projectedSavingsRateAfter: savingsRateAfter,

    emergencyFundMonths: snapshot.emergencyFundMonths,
    emergencyFundMonthsAfter: emergencyMonthsAfter,
    emergencyReserveBreached: reserveBreached,

    purchaseToIncomeRatio: toPercent(safeRatio(price, monthlyIncome)),
    purchaseToDiscretionaryRatio: discretionaryRemaining > 0 ? toPercent(budgetRatio) : 0,
    cashFlowRiskLevel: cashFlowRiskLevel(bufferMonths),
    debtToIncomeRatioPercent: snapshot.debtToIncomeRatioPercent,
    financialHealthScore: healthBefore.score,
    financialHealthScoreAfter: healthAfter.score,

    opportunityCost: {
      horizonYears: years,
      annualRatePercent: OPPORTUNITY_COST.illustrativeAnnualRatePercent,
      futureValue: fromMinor(futureValueMinor),
      foregoneGrowth: fromMinor((futureValueMinor - price) as Minor),
      assumptionNote: OPPORTUNITY_COST.assumptionNote,
    },

    savingPlan,

    recurringImpact:
      recurringMonthly > 0
        ? {
            monthlyCost: fromMinor(recurringMonthly as Minor),
            annualCost: fromMinor((recurringMonthly * 12) as Minor),
            percentOfMonthlyIncome: toPercent(safeRatio(recurringMonthly, monthlyIncome)),
            percentOfDiscretionaryBudget: toPercent(
              safeRatio(recurringMonthly, Math.max(internals.discretionaryBudget, 1)),
            ),
          }
        : null,

    factors,
    primaryReasons,
    recommendedActions,
    engineVersion: ENGINE_VERSION,
    computedAt: snapshot.asOf,
  };
}

// ------------------------------------------------------------------ narrative

interface ReasonArgs {
  verdict: PurchaseVerdict;
  guardrailNotes: string[];
  price: Minor;
  discretionaryRemaining: Minor;
  budgetOverage: Minor;
  savingsTarget: Minor;
  projectedSavingsAfter: Minor;
  emergencyMonthsAfter: number;
  targetMonths: number;
  upcomingObligations: Minor;
  recurringMonthly: Minor;
}

function buildReasons(args: ReasonArgs): string[] {
  const reasons: string[] = [...args.guardrailNotes];

  if (args.budgetOverage > 0 && args.discretionaryRemaining > 0) {
    const overBy = toPercent(safeRatio(args.budgetOverage, args.discretionaryRemaining));
    reasons.push(
      `Purchase exceeds your remaining discretionary budget by ${formatINR(fromMinor(args.budgetOverage))} (${overBy}%)`,
    );
  } else if (args.budgetOverage > 0) {
    reasons.push('Your discretionary budget for this month is already exhausted');
  }

  if (args.savingsTarget > 0 && args.projectedSavingsAfter < args.savingsTarget) {
    reasons.push(
      `Savings target of ${formatINR(fromMinor(args.savingsTarget))} would not be met — projection drops to ${formatINR(fromMinor(args.projectedSavingsAfter))}`,
    );
  }

  if (args.emergencyMonthsAfter < args.targetMonths) {
    reasons.push(
      `Emergency fund would cover ${args.emergencyMonthsAfter} months against your ${args.targetMonths}-month target`,
    );
  }

  if (args.upcomingObligations > 0) {
    reasons.push(
      `You have ${formatINR(fromMinor(args.upcomingObligations))} of committed payments still due this month`,
    );
  }

  if (args.recurringMonthly > 0) {
    reasons.push(
      `This adds a recurring ${formatINR(fromMinor(args.recurringMonthly))} per month (${formatINR(fromMinor((args.recurringMonthly * 12) as Minor))} per year)`,
    );
  }

  if (reasons.length === 0) {
    reasons.push('Purchase fits inside your budget, savings plan and cash reserves');
  }

  return reasons.slice(0, 5);
}

function buildActions(args: {
  verdict: PurchaseVerdict;
  savingPlan: PurchaseDecision['savingPlan'];
  budgetOverage: Minor;
  category: string;
}): string[] {
  const actions: string[] = [];
  switch (args.verdict) {
    case PurchaseVerdict.SMART_BUY:
      actions.push('Go ahead — this fits your plan.');
      actions.push('Log the purchase so your budget stays accurate.');
      break;
    case PurchaseVerdict.AFFORDABLE_BUT_CAUTION:
      actions.push('You can afford it, but it uses a meaningful share of this month\'s room.');
      actions.push(
        `Consider trimming other ${categoryLabel(args.category).toLowerCase()} spending for the rest of the month.`,
      );
      break;
    case PurchaseVerdict.WAIT_AND_SAVE:
      if (args.savingPlan) {
        actions.push(
          `Set aside ${formatINR(args.savingPlan.suggestedMonthlyContribution)} per month and buy in ${args.savingPlan.monthsToTarget} month(s).`,
        );
      }
      actions.push('Create a savings goal so the money is ring-fenced.');
      break;
    case PurchaseVerdict.NOT_RECOMMENDED:
      actions.push('Hold off — this would compromise your reserves.');
      if (args.savingPlan) {
        actions.push(
          `A ${formatINR(args.savingPlan.suggestedMonthlyContribution)}/month plan reaches the amount in ${args.savingPlan.monthsToTarget} month(s).`,
        );
      }
      actions.push('Review whether a lower-cost alternative meets the same need.');
      break;
    default:
      break;
  }
  return actions;
}
