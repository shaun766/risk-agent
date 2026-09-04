import {
  ENGINE_VERSION,
  HEALTH_TARGETS,
  HEALTH_WEIGHTS,
  RISK_BANDS,
  RiskLevel,
  type FinancialHealth,
  type FinancialSnapshot,
  type HealthComponent,
  clamp,
  round,
  safeRatio,
} from '@flowmoney/shared-types';
import { mean, standardDeviation } from './aggregate';
import type { SnapshotInternals } from './snapshot';

/**
 * Optional what-if overrides. The purchase engine uses these to answer "what
 * would my health score be if I bought this?" without duplicating the scoring
 * rules.
 */
export interface HealthOverrides {
  savingsRatePercent?: number;
  emergencyFundMonths?: number;
  budgetAdherencePercent?: number;
  debtToIncomeRatioPercent?: number;
}

export function riskLevelForScore(score: number): RiskLevel {
  for (const band of RISK_BANDS) {
    if (score >= band.min) return band.level;
  }
  return RiskLevel.CRITICAL;
}

/** Fraction of a component earned, always clamped to 0..1. */
function ratioScore(actual: number, target: number): number {
  if (target <= 0) return 1;
  return clamp(actual / target, 0, 1);
}

function componentOf(
  key: string,
  label: string,
  fraction: number,
  maxScore: number,
  detail: string,
  inputs: Record<string, number>,
): HealthComponent {
  const score = round(clamp(fraction, 0, 1) * maxScore, 2);
  return {
    key,
    label,
    score,
    maxScore,
    weightPercent: maxScore,
    detail,
    inputs,
  };
}

/**
 * Cash-flow stability rewards two things: months that end in the black, and low
 * variance in what is left over. A user who swings between +40k and -30k is
 * riskier than one who reliably lands on +5k, even at the same average.
 */
function cashFlowStabilityFraction(internals: SnapshotInternals): {
  fraction: number;
  inputs: Record<string, number>;
} {
  const completed = internals.monthlyAggregates.filter((a) => a.month !== internals.period.key);
  if (completed.length < 2) {
    return {
      fraction: 0.6,
      inputs: { monthsObserved: completed.length, positiveMonthsRatio: 0, volatility: 0 },
    };
  }

  const nets = completed.map((a) => a.net);
  const incomes = completed.map((a) => a.income);
  const positiveMonthsRatio = nets.filter((n) => n >= 0).length / nets.length;
  const averageIncome = Math.max(mean(incomes), 1);
  const volatility = clamp(standardDeviation(nets) / averageIncome, 0, 1);

  return {
    fraction: clamp(0.6 * positiveMonthsRatio + 0.4 * (1 - volatility), 0, 1),
    inputs: {
      monthsObserved: completed.length,
      positiveMonthsRatio: round(positiveMonthsRatio * 100, 2),
      volatilityPercent: round(volatility * 100, 2),
    },
  };
}

export function computeFinancialHealth(
  snapshot: FinancialSnapshot,
  internals: SnapshotInternals,
  overrides: HealthOverrides = {},
): FinancialHealth {
  const savingsRate = overrides.savingsRatePercent ?? snapshot.projectedSavingsRatePercent;
  const emergencyMonths = overrides.emergencyFundMonths ?? snapshot.emergencyFundMonths;
  const adherence = overrides.budgetAdherencePercent ?? snapshot.budgetAdherencePercent;
  const dti = overrides.debtToIncomeRatioPercent ?? snapshot.debtToIncomeRatioPercent;
  const investmentRate = round(
    safeRatio(snapshot.investedThisPeriod, snapshot.monthlyIncome) * 100,
    2,
  );

  const savings = componentOf(
    'savings',
    'Savings',
    ratioScore(savingsRate, HEALTH_TARGETS.targetSavingsRatePercent),
    HEALTH_WEIGHTS.savings,
    `Projected savings rate of ${round(savingsRate, 1)}% against a ${HEALTH_TARGETS.targetSavingsRatePercent}% target.`,
    { savingsRatePercent: round(savingsRate, 2), targetPercent: HEALTH_TARGETS.targetSavingsRatePercent },
  );

  const budgetAdherence = componentOf(
    'budgetAdherence',
    'Budget Discipline',
    ratioScore(adherence, 100),
    HEALTH_WEIGHTS.budgetAdherence,
    `You are tracking at ${round(adherence, 1)}% adherence to your planned envelopes.`,
    { adherencePercent: round(adherence, 2) },
  );

  const emergencyFund = componentOf(
    'emergencyFund',
    'Emergency Fund',
    ratioScore(emergencyMonths, snapshot.emergencyFundTargetMonths || HEALTH_TARGETS.targetEmergencyMonths),
    HEALTH_WEIGHTS.emergencyFund,
    `${round(emergencyMonths, 1)} months of essential expenses covered against a ${snapshot.emergencyFundTargetMonths}-month target.`,
    {
      months: round(emergencyMonths, 2),
      targetMonths: snapshot.emergencyFundTargetMonths,
      balance: snapshot.emergencyFundBalance,
    },
  );

  const debtBurden = componentOf(
    'debtBurden',
    'Debt',
    clamp(1 - safeRatio(dti, HEALTH_TARGETS.maxHealthyDebtToIncomePercent), 0, 1),
    HEALTH_WEIGHTS.debtBurden,
    dti > 0
      ? `Debt payments consume ${round(dti, 1)}% of income (healthy ceiling ${HEALTH_TARGETS.maxHealthyDebtToIncomePercent}%).`
      : 'No recurring debt obligations detected.',
    { debtToIncomePercent: round(dti, 2), ceilingPercent: HEALTH_TARGETS.maxHealthyDebtToIncomePercent },
  );

  const stability = cashFlowStabilityFraction(internals);
  const cashFlow = componentOf(
    'cashFlowStability',
    'Cash Flow',
    stability.fraction,
    HEALTH_WEIGHTS.cashFlowStability,
    stability.inputs.monthsObserved && stability.inputs.monthsObserved >= 2
      ? `${stability.inputs.positiveMonthsRatio}% of observed months ended cash-positive.`
      : 'Not enough history yet — scored neutrally until three months of data exist.',
    stability.inputs,
  );

  const investments = componentOf(
    'investmentProgress',
    'Investments',
    ratioScore(investmentRate, HEALTH_TARGETS.targetInvestmentRatePercent),
    HEALTH_WEIGHTS.investmentProgress,
    investmentRate > 0
      ? `Investing ${round(investmentRate, 1)}% of income this month.`
      : 'No investment contributions recorded this month.',
    { investmentRatePercent: investmentRate, targetPercent: HEALTH_TARGETS.targetInvestmentRatePercent },
  );

  const components = [savings, budgetAdherence, emergencyFund, debtBurden, cashFlow, investments];
  const score = round(
    components.reduce((sum, c) => sum + c.score, 0),
    2,
  );

  const ranked = [...components].sort((a, b) => b.score / b.maxScore - a.score / a.maxScore);
  const strengths = ranked
    .filter((c) => c.score / c.maxScore >= 0.75)
    .slice(0, 3)
    .map((c) => `${c.label}: ${c.score}/${c.maxScore} — ${c.detail}`);
  const weaknesses = [...ranked]
    .reverse()
    .filter((c) => c.score / c.maxScore < 0.6)
    .slice(0, 3)
    .map((c) => `${c.label}: ${c.score}/${c.maxScore} — ${c.detail}`);

  return {
    score,
    riskLevel: riskLevelForScore(score),
    components,
    strengths,
    weaknesses,
    computedAt: snapshot.asOf,
    engineVersion: ENGINE_VERSION,
  };
}
