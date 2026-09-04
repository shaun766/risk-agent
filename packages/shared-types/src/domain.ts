/**
 * Domain result types produced by the deterministic financial engine.
 *
 * Every monetary field here is expressed in MAJOR units (rupees, 2dp). The
 * engine computes in minor units internally and converts exactly once, at its
 * public boundary, so these objects are safe to serialise straight to JSON,
 * hand to the LLM as tool output, or render in the dashboard.
 *
 * The LLM is allowed to *read* these numbers. It is never allowed to produce them.
 */
import type {
  AllocationBucket,
  BudgetStrategy,
  CategoryKind,
  Intent,
  LiquidityLevel,
  PurchaseVerdict,
  RiskLevel,
  TransactionDirection,
} from './enums';

// ------------------------------------------------------------------- inputs --

/** A single posted or pending transaction, normalised for the engine. */
export interface EngineTransaction {
  id: string;
  amount: number;
  direction: TransactionDirection;
  occurredAt: string;
  categoryKey: string;
  categoryKind: CategoryKind;
  merchantName: string | null;
  description: string | null;
  isRecurring: boolean;
  isPending: boolean;
}

export interface EngineAccount {
  id: string;
  type: string;
  balance: number;
  availableBalance: number;
  /** Credit cards / loans carry a negative contribution to net worth. */
  isLiability: boolean;
  /** Ring-fenced emergency savings — excluded from the spendable pool. */
  isEmergencyFund: boolean;
  currency: string;
}

export interface EngineRecurringObligation {
  label: string;
  amount: number;
  dueDay: number;
  categoryKey: string;
  categoryKind: CategoryKind;
}

export interface EngineBudgetAllocation {
  categoryKey: string;
  categoryKind: CategoryKind;
  allocated: number;
}

export interface EngineBudgetRule {
  type: 'CATEGORY_MAX' | 'CATEGORY_MIN' | 'SAVINGS_MIN' | 'TOTAL_SPEND_MAX';
  categoryKey: string | null;
  amount: number;
  label: string;
}

export interface EngineBudget {
  id: string;
  strategy: BudgetStrategy;
  periodStart: string;
  periodEnd: string;
  monthlyIncome: number;
  needsPercent: number;
  wantsPercent: number;
  savingsPercent: number;
  investmentsPercent: number;
  debtPercent: number;
  allocations: EngineBudgetAllocation[];
  rules: EngineBudgetRule[];
}

/** Everything the engine needs about a user, gathered by the repository layer. */
export interface EngineContext {
  userId: string;
  asOf: string;
  currency: string;
  accounts: EngineAccount[];
  /** Current-period transactions plus enough history for behavioural baselines. */
  transactions: EngineTransaction[];
  budget: EngineBudget | null;
  recurringObligations: EngineRecurringObligation[];
  /** Configured emergency-fund target expressed in months of essential spend. */
  emergencyFundTargetMonths: number;
  /** Explicit reserve the user never wants to dip below, if configured. */
  emergencyReserveAmount: number | null;
  monthlyDebtPayments: number;
  totalDebtOutstanding: number;
  declaredMonthlyIncome: number | null;
  savingsGoals: Array<{
    id: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: string | null;
    monthlyContribution: number;
  }>;
  investmentContributionsThisMonth: number;
  portfolioValue: number;
}

// ---------------------------------------------------------------- snapshot --

export interface CategorySpend {
  categoryKey: string;
  categoryLabel: string;
  categoryKind: CategoryKind;
  spent: number;
  allocated: number;
  remaining: number;
  utilisationPercent: number;
  transactionCount: number;
}

export interface CashFlowPoint {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
  runningBalance: number;
}

/**
 * The canonical financial position of a user at a point in time. This single
 * object is the input to purchase analysis, health scoring and every AI tool.
 */
export interface FinancialSnapshot {
  userId: string;
  asOf: string;
  currency: string;
  period: { start: string; end: string; daysElapsed: number; daysRemaining: number; totalDays: number };

  // balances
  totalBalance: number;
  availableBalance: number;
  liabilitiesOutstanding: number;
  netWorth: number;

  // income
  monthlyIncome: number;
  incomeReceivedThisPeriod: number;
  incomeExpectedRemaining: number;

  // spending
  totalSpentThisPeriod: number;
  essentialSpent: number;
  discretionarySpent: number;
  debtPaidThisPeriod: number;
  savedThisPeriod: number;
  investedThisPeriod: number;

  // forward-looking commitments
  essentialExpensesRemaining: number;
  upcomingRecurringPayments: number;
  upcomingObligations: Array<{ label: string; amount: number; dueDate: string }>;

  // budget position
  discretionaryBudget: number;
  discretionaryBudgetRemaining: number;
  savingsTarget: number;
  savingsProgress: number;
  savingsShortfall: number;
  budgetAdherencePercent: number;
  projectedMonthEndSpend: number;
  projectedSavings: number;
  projectedSavingsRatePercent: number;
  currentSavingsRatePercent: number;

  // safety
  emergencyFundBalance: number;
  emergencyFundTargetMonths: number;
  emergencyFundMonths: number;
  emergencyReserveAmount: number;
  safelySpendableCash: number;

  // debt
  monthlyDebtPayments: number;
  totalDebtOutstanding: number;
  debtToIncomeRatioPercent: number;

  // derived collections
  categoryBreakdown: CategorySpend[];
  dailyCashFlow: CashFlowPoint[];
  averageDailyDiscretionarySpend: number;
  burnRatePerDay: number;
  runwayDays: number;
}

// ------------------------------------------------------- purchase decision --

export interface PurchaseRequest {
  price: number;
  category: string;
  merchant?: string | null;
  description?: string | null;
  purchaseDate?: string | null;
  isRecurring?: boolean;
  monthlyCost?: number | null;
  /** 1 (impulse) .. 5 (essential). Defaults to 3 when not supplied. */
  importance?: number | null;
}

export interface DecisionFactor {
  key: string;
  label: string;
  /** 0..100 sub-score for this dimension. */
  score: number;
  /** Contribution weight, 0..1. Weights across all factors sum to 1. */
  weight: number;
  /** score * weight — the points this factor contributed to the total. */
  contribution: number;
  detail: string;
  /** Raw numbers behind the sub-score, for the audit trail and the UI. */
  inputs: Record<string, number>;
}

export interface PurchaseDecision {
  verdict: PurchaseVerdict;
  score: number;
  confidence: number;

  purchasePrice: number;
  category: string;
  merchant: string | null;

  availableBalance: number;
  safelySpendableCash: number;
  discretionaryBudgetRemaining: number;
  discretionaryBudgetAfter: number;
  affordabilityGap: number;
  budgetImpactPercentage: number;

  essentialExpensesRemaining: number;
  upcomingRecurringPayments: number;
  incomeExpectedRemaining: number;

  savingsTarget: number;
  projectedSavingsBeforePurchase: number;
  projectedSavingsAfterPurchase: number;
  projectedSavingsRateBefore: number;
  projectedSavingsRateAfter: number;

  emergencyFundMonths: number;
  emergencyFundMonthsAfter: number;
  emergencyReserveBreached: boolean;

  purchaseToIncomeRatio: number;
  purchaseToDiscretionaryRatio: number;
  cashFlowRiskLevel: RiskLevel;
  debtToIncomeRatioPercent: number;
  financialHealthScore: number;
  financialHealthScoreAfter: number;

  /** Illustrative growth of the same money if not spent. Clearly labelled. */
  opportunityCost: {
    horizonYears: number;
    annualRatePercent: number;
    futureValue: number;
    foregoneGrowth: number;
    assumptionNote: string;
  };

  /** Present when the purchase is not affordable now. */
  savingPlan: {
    amountToAccumulate: number;
    suggestedMonthlyContribution: number;
    monthsToTarget: number;
    targetDate: string;
  } | null;

  recurringImpact: {
    monthlyCost: number;
    annualCost: number;
    percentOfMonthlyIncome: number;
    percentOfDiscretionaryBudget: number;
  } | null;

  factors: DecisionFactor[];
  primaryReasons: string[];
  recommendedActions: string[];
  engineVersion: string;
  computedAt: string;
}

// ------------------------------------------------------- financial health --

export interface HealthComponent {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  weightPercent: number;
  detail: string;
  inputs: Record<string, number>;
}

export interface FinancialHealth {
  score: number;
  riskLevel: RiskLevel;
  components: HealthComponent[];
  strengths: string[];
  weaknesses: string[];
  computedAt: string;
  engineVersion: string;
}

// ------------------------------------------------------------ budget status --

export interface BudgetStatus {
  budgetId: string | null;
  strategy: BudgetStrategy | null;
  periodStart: string;
  periodEnd: string;
  monthlyIncome: number;
  planned: { needs: number; wants: number; savings: number; investments: number; debt: number };
  actual: { needs: number; wants: number; savings: number; investments: number; debt: number };
  variance: { needs: number; wants: number; savings: number; investments: number; debt: number };
  totalAllocated: number;
  totalSpent: number;
  remaining: number;
  adherencePercent: number;
  projectedMonthEndSpend: number;
  projectedOverspend: number;
  categories: CategorySpend[];
  ruleViolations: Array<{
    label: string;
    type: string;
    limit: number;
    actual: number;
    exceededBy: number;
    severity: RiskLevel;
  }>;
  daysRemaining: number;
  safeDailySpend: number;
}

// --------------------------------------------------------- savings / cash --

export interface IdleCashAnalysis {
  averageBalance: number;
  currentBalance: number;
  upcomingExpenses30d: number;
  emergencyReserve: number;
  surplusCash: number;
  hasSurplus: boolean;
  explanation: string;
}

export interface AllocationSuggestion {
  bucket: AllocationBucket;
  label: string;
  amount: number;
  percentOfSurplus: number;
  riskLevel: RiskLevel;
  liquidity: LiquidityLevel;
  horizon: string;
  illustrativeAnnualReturnPercent: { low: number; high: number } | null;
  rationale: string;
  suggestedProductIds: string[];
}

export interface AllocationPlan {
  surplusCash: number;
  suggestions: AllocationSuggestion[];
  totalAllocated: number;
  disclaimer: string;
  computedAt: string;
}

export interface SavingsOpportunity {
  key: string;
  title: string;
  monthlySaving: number;
  annualSaving: number;
  confidence: number;
  evidence: string;
  categoryKey: string | null;
}

// -------------------------------------------------------------- anomalies --

export interface SpendingAnomaly {
  transactionId: string | null;
  type: 'AMOUNT_OUTLIER' | 'NEW_MERCHANT_HIGH_VALUE' | 'CATEGORY_SPIKE' | 'VELOCITY' | 'DUPLICATE';
  severity: RiskLevel;
  title: string;
  detail: string;
  amount: number;
  baseline: number;
  deviationPercent: number;
  occurredAt: string;
}

// ---------------------------------------------------------------- reports --

export interface BehaviouralInsight {
  key: string;
  headline: string;
  detail: string;
  metric: number;
  comparison: number;
  changePercent: number;
  direction: 'UP' | 'DOWN' | 'FLAT';
}

export interface MonthlyReportData {
  month: string;
  periodStart: string;
  periodEnd: string;
  overview: {
    income: number;
    totalSpending: number;
    savings: number;
    investments: number;
    netCashFlow: number;
    savingsRatePercent: number;
  };
  previousMonth: {
    income: number;
    totalSpending: number;
    savings: number;
    savingsRatePercent: number;
  } | null;
  spendingBreakdown: CategorySpend[];
  budgetPerformance: BudgetStatus | null;
  insights: BehaviouralInsight[];
  health: FinancialHealth;
  healthTrend: Array<{ month: string; score: number }>;
  savingsPerformance: { target: number; actual: number; achievedPercent: number; shortfall: number };
  investmentActivity: { contributions: number; portfolioValue: number; contributionChangePercent: number };
  topMerchants: Array<{ merchant: string; amount: number; count: number }>;
  largestTransactions: Array<{ description: string; amount: number; category: string; occurredAt: string }>;
  purchaseDecisions: Array<{ description: string; price: number; verdict: PurchaseVerdict; score: number; createdAt: string }>;
  recommendations: Array<{ title: string; detail: string; impact: number }>;
  forecast: {
    projectedSpending: number;
    projectedSavings: number;
    projectedBalance: number;
    basis: string;
  };
  engineVersion: string;
  computedAt: string;
}

// -------------------------------------------------------------- AI output --

export interface StructuredAIResponse {
  summary: string;
  recommendation: string;
  reasons: string[];
  nextActions: string[];
  riskLevel: RiskLevel;
}

export interface AgentRunTrace {
  conversationId: string;
  messageId: string;
  intent: Intent;
  intentConfidence: number;
  agentKey: string;
  agentId: string | null;
  toolsUsed: Array<{ name: string; durationMs: number; ok: boolean; argsSummary: Record<string, unknown> }>;
  snapshotId: string | null;
  model: string;
  usedLLM: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
}

export interface AgentReply {
  text: string;
  structured: StructuredAIResponse | null;
  quickActions: Array<{ label: string; command: string }>;
  trace: AgentRunTrace;
  attachments?: Array<{ kind: 'audio' | 'pdf'; url: string }>;
}
