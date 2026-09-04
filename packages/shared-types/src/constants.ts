/**
 * Tunable constants for the deterministic engine plus the canonical category
 * taxonomy. Everything the engine treats as a "policy decision" lives here so a
 * bank can review the numbers in one place.
 */
import { AllocationBucket, BudgetStrategy, CategoryKind, PurchaseVerdict, RiskLevel } from './enums';

export const ENGINE_VERSION = '1.0.0';
export const DEFAULT_CURRENCY = 'INR';

// ------------------------------------------------------------- categories --

export interface CategoryDefinition {
  key: string;
  label: string;
  kind: CategoryKind;
  icon: string;
  colour: string;
  /** Share of the "needs"/"wants" envelope this category typically takes. */
  defaultShare: number;
}

export const CATEGORIES: CategoryDefinition[] = [
  { key: 'salary', label: 'Salary', kind: CategoryKind.INCOME, icon: 'Wallet', colour: '#10b981', defaultShare: 0 },
  { key: 'other_income', label: 'Other Income', kind: CategoryKind.INCOME, icon: 'TrendingUp', colour: '#34d399', defaultShare: 0 },
  { key: 'housing', label: 'Housing', kind: CategoryKind.ESSENTIAL, icon: 'Home', colour: '#6366f1', defaultShare: 0.42 },
  { key: 'groceries', label: 'Groceries', kind: CategoryKind.ESSENTIAL, icon: 'ShoppingCart', colour: '#0ea5e9', defaultShare: 0.2 },
  { key: 'utilities', label: 'Utilities', kind: CategoryKind.ESSENTIAL, icon: 'Zap', colour: '#f59e0b', defaultShare: 0.1 },
  { key: 'transport', label: 'Transport', kind: CategoryKind.ESSENTIAL, icon: 'Car', colour: '#8b5cf6', defaultShare: 0.12 },
  { key: 'healthcare', label: 'Healthcare', kind: CategoryKind.ESSENTIAL, icon: 'HeartPulse', colour: '#ef4444', defaultShare: 0.08 },
  { key: 'insurance', label: 'Insurance', kind: CategoryKind.ESSENTIAL, icon: 'ShieldCheck', colour: '#14b8a6', defaultShare: 0.05 },
  { key: 'education', label: 'Education', kind: CategoryKind.ESSENTIAL, icon: 'GraduationCap', colour: '#3b82f6', defaultShare: 0.03 },
  { key: 'dining', label: 'Dining', kind: CategoryKind.DISCRETIONARY, icon: 'UtensilsCrossed', colour: '#f97316', defaultShare: 0.3 },
  { key: 'entertainment', label: 'Entertainment', kind: CategoryKind.DISCRETIONARY, icon: 'Clapperboard', colour: '#ec4899', defaultShare: 0.16 },
  { key: 'shopping', label: 'Shopping', kind: CategoryKind.DISCRETIONARY, icon: 'ShoppingBag', colour: '#a855f7', defaultShare: 0.26 },
  { key: 'subscriptions', label: 'Subscriptions', kind: CategoryKind.DISCRETIONARY, icon: 'Repeat', colour: '#06b6d4', defaultShare: 0.08 },
  { key: 'travel', label: 'Travel', kind: CategoryKind.DISCRETIONARY, icon: 'Plane', colour: '#22d3ee', defaultShare: 0.14 },
  { key: 'personal_care', label: 'Personal Care', kind: CategoryKind.DISCRETIONARY, icon: 'Sparkles', colour: '#fb7185', defaultShare: 0.06 },
  { key: 'savings', label: 'Savings', kind: CategoryKind.SAVINGS, icon: 'PiggyBank', colour: '#22c55e', defaultShare: 0 },
  { key: 'investments', label: 'Investments', kind: CategoryKind.INVESTMENT, icon: 'LineChart', colour: '#16a34a', defaultShare: 0 },
  { key: 'debt_repayment', label: 'Debt Repayment', kind: CategoryKind.DEBT, icon: 'Banknote', colour: '#dc2626', defaultShare: 0 },
  { key: 'transfer', label: 'Transfer', kind: CategoryKind.TRANSFER, icon: 'ArrowLeftRight', colour: '#94a3b8', defaultShare: 0 },
  { key: 'other', label: 'Other', kind: CategoryKind.DISCRETIONARY, icon: 'CircleDashed', colour: '#64748b', defaultShare: 0 },
];

export const CATEGORY_BY_KEY: Record<string, CategoryDefinition> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
);

export function categoryKind(key: string): CategoryKind {
  return CATEGORY_BY_KEY[key]?.kind ?? CategoryKind.DISCRETIONARY;
}

export function categoryLabel(key: string): string {
  return CATEGORY_BY_KEY[key]?.label ?? key;
}

export const ESSENTIAL_CATEGORY_KEYS = CATEGORIES.filter((c) => c.kind === CategoryKind.ESSENTIAL).map((c) => c.key);
export const DISCRETIONARY_CATEGORY_KEYS = CATEGORIES.filter((c) => c.kind === CategoryKind.DISCRETIONARY).map((c) => c.key);

// -------------------------------------------------------- budget strategies --

export interface StrategyPreset {
  strategy: BudgetStrategy;
  name: string;
  tagline: string;
  needsPercent: number;
  wantsPercent: number;
  savingsPercent: number;
  investmentsPercent: number;
  debtPercent: number;
}

export const BUDGET_PRESETS: Record<Exclude<BudgetStrategy, 'CUSTOM'>, StrategyPreset> = {
  BALANCED: {
    strategy: BudgetStrategy.BALANCED,
    name: 'Balanced Budget',
    tagline: 'The classic 50 / 30 / 20 split. Steady progress without feeling restrictive.',
    needsPercent: 50,
    wantsPercent: 30,
    savingsPercent: 20,
    investmentsPercent: 0,
    debtPercent: 0,
  },
  AGGRESSIVE_SAVINGS: {
    strategy: BudgetStrategy.AGGRESSIVE_SAVINGS,
    name: 'Aggressive Savings',
    tagline: 'Front-load your savings rate. Best when building an emergency fund fast.',
    needsPercent: 50,
    wantsPercent: 15,
    savingsPercent: 35,
    investmentsPercent: 0,
    debtPercent: 0,
  },
  DEBT_REDUCTION: {
    strategy: BudgetStrategy.DEBT_REDUCTION,
    name: 'Debt Reduction',
    tagline: 'Dedicate a fifth of income to clearing balances before they compound.',
    needsPercent: 50,
    wantsPercent: 15,
    savingsPercent: 15,
    investmentsPercent: 0,
    debtPercent: 20,
  },
  GROWTH_MODE: {
    strategy: BudgetStrategy.GROWTH_MODE,
    name: 'Growth Mode',
    tagline: 'For a funded emergency reserve — route surplus into long-term investing.',
    needsPercent: 50,
    wantsPercent: 15,
    savingsPercent: 15,
    investmentsPercent: 20,
    debtPercent: 0,
  },
};

export const CUSTOM_PRESET: StrategyPreset = {
  strategy: BudgetStrategy.CUSTOM,
  name: 'Custom Budget',
  tagline: 'Define your own split and per-category caps.',
  needsPercent: 50,
  wantsPercent: 30,
  savingsPercent: 20,
  investmentsPercent: 0,
  debtPercent: 0,
};

export function presetFor(strategy: BudgetStrategy): StrategyPreset {
  if (strategy === BudgetStrategy.CUSTOM) return CUSTOM_PRESET;
  return BUDGET_PRESETS[strategy];
}

// ----------------------------------------------- purchase decision policy --

/** Factor weights must sum to 1.0 — asserted by a unit test. */
export const PURCHASE_FACTOR_WEIGHTS = {
  cashAvailability: 0.22,
  budgetCompatibility: 0.22,
  savingsImpact: 0.18,
  emergencyFundSafety: 0.15,
  cashFlowRisk: 0.1,
  debtBurden: 0.07,
  purchaseImportance: 0.06,
} as const;

export type PurchaseFactorKey = keyof typeof PURCHASE_FACTOR_WEIGHTS;

export const VERDICT_THRESHOLDS: Array<{ min: number; verdict: PurchaseVerdict }> = [
  { min: 80, verdict: PurchaseVerdict.SMART_BUY },
  { min: 60, verdict: PurchaseVerdict.AFFORDABLE_BUT_CAUTION },
  { min: 40, verdict: PurchaseVerdict.WAIT_AND_SAVE },
  { min: 0, verdict: PurchaseVerdict.NOT_RECOMMENDED },
];

/**
 * Hard safety rails. A purchase that trips one of these can never be graded
 * above the stated ceiling regardless of how well it scores elsewhere — this is
 * what stops "great score, empty bank account" outcomes.
 */
export const DECISION_GUARDRAILS = {
  /**
   * A purchase larger than the cash remaining after every known bill cannot be
   * funded at all. That is a hard ceiling, independent of any soft score.
   */
  cappedScoreWhenCashUnsafe: 39,
  /** Eroding the emergency reserve caps the score here. */
  cappedScoreWhenReserveBreached: 45,
  /**
   * …but only once the purchase is a material fraction of that reserve. A user
   * who is temporarily under-reserved should not be told to "wait and save"
   * before buying a coffee.
   */
  reserveMaterialityThreshold: 0.05,
  /** Purchase larger than this multiple of monthly income is never a SMART_BUY. */
  incomeMultipleForcingCaution: 0.5,
  cappedScoreWhenLargeVsIncome: 72,
} as const;

// ------------------------------------------------- financial health policy --

export const HEALTH_WEIGHTS = {
  savings: 20,
  budgetAdherence: 20,
  emergencyFund: 20,
  debtBurden: 15,
  cashFlowStability: 15,
  investmentProgress: 10,
} as const;

export const HEALTH_TARGETS = {
  /** Savings rate at which the savings component scores full marks. */
  targetSavingsRatePercent: 20,
  /** Months of essential spend for a fully-funded emergency fund. */
  targetEmergencyMonths: 6,
  /** Debt payments above this share of income score zero. */
  maxHealthyDebtToIncomePercent: 36,
  /** Investment contributions at this share of income score full marks. */
  targetInvestmentRatePercent: 10,
} as const;

export const RISK_BANDS: Array<{ min: number; level: RiskLevel }> = [
  { min: 75, level: RiskLevel.LOW },
  { min: 55, level: RiskLevel.MODERATE },
  { min: 35, level: RiskLevel.HIGH },
  { min: 0, level: RiskLevel.CRITICAL },
];

// -------------------------------------------------------- opportunity cost --

export const OPPORTUNITY_COST = {
  defaultHorizonYears: 5,
  /** Illustrative only — surfaced to users with an explicit assumption note. */
  illustrativeAnnualRatePercent: 8,
  assumptionNote:
    'Illustrative only. Assumes a constant annual return with no fees, taxes or withdrawals. Not a forecast or a guarantee.',
} as const;

// ------------------------------------------------------- allocation policy --

export interface AllocationRule {
  bucket: AllocationBucket;
  label: string;
  riskLevel: RiskLevel;
  liquidity: 'INSTANT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'LOCKED';
  horizon: string;
  illustrativeAnnualReturnPercent: { low: number; high: number } | null;
}

export const ALLOCATION_RULES: Record<AllocationBucket, AllocationRule> = {
  EMERGENCY_FUND: {
    bucket: AllocationBucket.EMERGENCY_FUND,
    label: 'Emergency fund top-up',
    riskLevel: RiskLevel.LOW,
    liquidity: 'INSTANT',
    horizon: 'Always available',
    illustrativeAnnualReturnPercent: { low: 3, high: 4 },
  },
  LIQUID_RESERVE: {
    bucket: AllocationBucket.LIQUID_RESERVE,
    label: 'High-liquidity reserve',
    riskLevel: RiskLevel.LOW,
    liquidity: 'INSTANT',
    horizon: '0–3 months',
    illustrativeAnnualReturnPercent: { low: 4, high: 6 },
  },
  LOW_RISK: {
    bucket: AllocationBucket.LOW_RISK,
    label: 'Low-risk savings instruments',
    riskLevel: RiskLevel.LOW,
    liquidity: 'MEDIUM',
    horizon: '6–24 months',
    illustrativeAnnualReturnPercent: { low: 6, high: 7.5 },
  },
  LONG_TERM_GROWTH: {
    bucket: AllocationBucket.LONG_TERM_GROWTH,
    label: 'Long-term diversified growth',
    riskLevel: RiskLevel.MODERATE,
    liquidity: 'MEDIUM',
    horizon: '5+ years',
    illustrativeAnnualReturnPercent: { low: 9, high: 13 },
  },
  DEBT_REPAYMENT: {
    bucket: AllocationBucket.DEBT_REPAYMENT,
    label: 'Extra debt repayment',
    riskLevel: RiskLevel.LOW,
    liquidity: 'LOCKED',
    horizon: 'Immediate',
    illustrativeAnnualReturnPercent: null,
  },
  GOAL_FUNDING: {
    bucket: AllocationBucket.GOAL_FUNDING,
    label: 'Fund an active savings goal',
    riskLevel: RiskLevel.LOW,
    liquidity: 'HIGH',
    horizon: 'Goal timeline',
    illustrativeAnnualReturnPercent: { low: 4, high: 6 },
  },
};

export const ADVICE_DISCLAIMER =
  'This is educational guidance generated from your own transaction data, not personalised investment advice. FlowMoney AI is not a registered investment adviser. Figures marked illustrative are simulations, not forecasts.';

// ------------------------------------------------------------- anomalies --

export const ANOMALY_POLICY = {
  /** Standard deviations above the category mean before a txn is an outlier. */
  amountZScoreThreshold: 2.5,
  /** A new merchant charging more than this share of monthly income is flagged. */
  newMerchantIncomeShare: 0.15,
  /** Category spend above this multiple of its 3-month average is a spike. */
  categorySpikeMultiple: 1.75,
  /** More than N transactions at one merchant within the window is velocity. */
  velocityCount: 4,
  velocityWindowHours: 2,
  duplicateWindowMinutes: 10,
} as const;

// --------------------------------------------------------------- runtime --

export const IDLE_CASH_POLICY = {
  lookforwardDays: 30,
  /** Cash below this amount is never reported as "idle". */
  minimumSurplusToReport: 10_000,
} as const;

export const WHATSAPP_LIMITS = {
  maxBodyLength: 4096,
  maxButtons: 3,
} as const;
