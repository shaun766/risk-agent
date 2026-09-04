/** Response shapes the dashboard consumes. Mirrors the API's serialised output. */

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  roles: string[];
  permissions: string[];
  profile: {
    occupation: string | null;
    city: string | null;
    currency: string;
    locale: string;
    declaredMonthlyIncome: number | null;
    emergencyFundTargetMonths: number;
    emergencyReserveAmount: number | null;
    whatsappOptIn: boolean;
    voiceRepliesEnabled: boolean;
    onboardingCompleted: boolean;
  } | null;
}

export interface CategorySpend {
  categoryKey: string;
  categoryLabel: string;
  categoryKind: string;
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

export interface FinancialSnapshot {
  userId: string;
  asOf: string;
  currency: string;
  period: { start: string; end: string; daysElapsed: number; daysRemaining: number; totalDays: number };
  totalBalance: number;
  availableBalance: number;
  liabilitiesOutstanding: number;
  netWorth: number;
  monthlyIncome: number;
  incomeReceivedThisPeriod: number;
  incomeExpectedRemaining: number;
  totalSpentThisPeriod: number;
  essentialSpent: number;
  discretionarySpent: number;
  debtPaidThisPeriod: number;
  savedThisPeriod: number;
  investedThisPeriod: number;
  essentialExpensesRemaining: number;
  upcomingRecurringPayments: number;
  upcomingObligations: Array<{ label: string; amount: number; dueDate: string }>;
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
  emergencyFundBalance: number;
  emergencyFundTargetMonths: number;
  emergencyFundMonths: number;
  emergencyReserveAmount: number;
  safelySpendableCash: number;
  monthlyDebtPayments: number;
  totalDebtOutstanding: number;
  debtToIncomeRatioPercent: number;
  categoryBreakdown: CategorySpend[];
  dailyCashFlow: CashFlowPoint[];
  averageDailyDiscretionarySpend: number;
  burnRatePerDay: number;
  runwayDays: number;
}

export interface HealthComponent {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  detail: string;
}

export interface FinancialHealth {
  score: number;
  riskLevel: string;
  components: HealthComponent[];
  strengths: string[];
  weaknesses: string[];
  trend?: Array<{ month: string; score: number }>;
}

export interface DecisionFactor {
  key: string;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  detail: string;
}

export interface PurchaseDecision {
  decisionId?: string | null;
  verdict: string;
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
  savingsTarget: number;
  projectedSavingsBeforePurchase: number;
  projectedSavingsAfterPurchase: number;
  projectedSavingsRateBefore: number;
  projectedSavingsRateAfter: number;
  emergencyFundMonths: number;
  emergencyFundMonthsAfter: number;
  emergencyReserveBreached: boolean;
  purchaseToIncomeRatio: number;
  cashFlowRiskLevel: string;
  financialHealthScore: number;
  financialHealthScoreAfter: number;
  opportunityCost: {
    horizonYears: number;
    annualRatePercent: number;
    futureValue: number;
    foregoneGrowth: number;
    assumptionNote: string;
  };
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
}

export interface BudgetStatus {
  budgetId: string | null;
  strategy: string | null;
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
    severity: string;
  }>;
  daysRemaining: number;
  safeDailySpend: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TransactionRow {
  id: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  status: string;
  description: string;
  merchant: string | null;
  category: { key: string; label: string; kind: string; colour: string; icon: string };
  account: { id: string; nickname: string | null };
  occurredAt: string;
  isRecurring: boolean;
}

export interface AccountRow {
  id: string;
  bank: { id: string; name: string; code: string };
  maskedNumber: string;
  nickname: string | null;
  type: string;
  currency: string;
  currentBalance: number;
  availableBalance: number;
  creditLimit: number | null;
  isLiability: boolean;
  isPrimary: boolean;
  isEmergencyFund: boolean;
}

export interface ChatTrace {
  intent: string;
  intentConfidence: number;
  agentKey: string;
  usedLLM: boolean;
  model: string;
  latencyMs: number;
  toolsUsed: Array<{ name: string; durationMs: number; ok: boolean }>;
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  reply: string;
  structured: {
    summary: string;
    recommendation: string;
    reasons: string[];
    nextActions: string[];
    riskLevel: string;
  } | null;
  quickActions: Array<{ label: string; command: string }>;
  purchaseDecisionId: string | null;
  trace: ChatTrace;
}
