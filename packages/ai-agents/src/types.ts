import type {
  AgentOutputFormat,
  AgentReply,
  AllocationPlan,
  BudgetStatus,
  ConversationChannel,
  FinancialHealth,
  FinancialSnapshot,
  IdleCashAnalysis,
  Intent,
  MonthlyReportData,
  PurchaseDecision,
  PurchaseRequest,
  SavingsOpportunity,
  SpendingAnomaly,
} from '@flowmoney/shared-types';

/** A tool result is always JSON — it is fed verbatim to the model. */
export type ToolResult = Record<string, unknown> | Array<unknown>;

export interface TransactionSummaryRow {
  id: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  description: string;
  merchant: string | null;
  categoryKey: string;
  occurredAt: string;
}

export interface InvestmentProfileView {
  riskTolerance: string;
  horizon: string;
  monthlyInvestmentCapacity: number;
  hasEmergencyFund: boolean;
  liquidityNeedsMonths: number;
  experienceLevel: string;
  goals: string[];
  portfolioValue: number;
  holdings: Array<{ name: string; type: string; investedAmount: number; currentValue: number }>;
}

export interface FinancialProductView {
  id: string;
  name: string;
  type: string;
  riskLevel: string;
  liquidity: string;
  minimumInvestment: number;
  interestRate: number;
  expectedReturnLow: number;
  expectedReturnHigh: number;
  lockInMonths: number;
  description: string;
  bucket: string | null;
}

export interface SavingsGoalView {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  monthsToTarget: number | null;
}

export interface PaymentAuthorizationRequest {
  amount: number;
  merchant: string;
  description?: string;
  categoryKey?: string;
  accountId?: string;
  purchaseDecisionId?: string | null;
}

export interface PaymentAuthorizationView {
  paymentIntentId: string;
  amount: number;
  merchant: string;
  accountMasked: string;
  confirmationPhrase: string;
  expiresAt: string;
  status: string;
  /** Always true — a payment never executes from an agent decision alone. */
  requiresExplicitUserConfirmation: true;
}

/**
 * Everything the agents are allowed to do with the outside world.
 *
 * The orchestrator is deliberately given an interface rather than a database:
 * it cannot read or write anything the host application has not explicitly
 * exposed, and every method is additionally permission-gated before it is
 * offered to a model.
 */
export interface ToolRuntime {
  getFinancialSnapshot(userId: string): Promise<FinancialSnapshot>;
  getRecentTransactions(
    userId: string,
    options: { limit?: number; days?: number; categoryKey?: string | null },
  ): Promise<TransactionSummaryRow[]>;
  getBudgetStatus(userId: string): Promise<BudgetStatus>;
  evaluatePurchase(
    userId: string,
    request: PurchaseRequest,
    options: { persist: boolean; channel: ConversationChannel; conversationId: string | null },
  ): Promise<{ decision: PurchaseDecision; decisionId: string | null }>;
  calculateFinancialHealth(userId: string): Promise<FinancialHealth>;
  getMonthlyReport(userId: string, month?: string): Promise<MonthlyReportData>;
  getSavingsOpportunities(userId: string): Promise<{
    idleCash: IdleCashAnalysis;
    opportunities: SavingsOpportunity[];
    allocation: AllocationPlan | null;
  }>;
  getInvestmentProfile(userId: string): Promise<InvestmentProfileView>;
  searchFinancialProducts(query: {
    type?: string;
    riskLevel?: string;
    bucket?: string;
    maxMinimumInvestment?: number;
  }): Promise<FinancialProductView[]>;
  detectSpendingAnomalies(userId: string): Promise<SpendingAnomaly[]>;
  createSavingsGoal(
    userId: string,
    input: { name: string; targetAmount: number; monthlyContribution?: number },
  ): Promise<SavingsGoalView>;
  requestPaymentAuthorization(
    userId: string,
    input: PaymentAuthorizationRequest,
  ): Promise<PaymentAuthorizationView>;
}

/** An agent as configured in the database. */
export interface AgentConfig {
  id: string;
  key: string;
  name: string;
  systemInstructions: string;
  allowedTools: string[];
  handledIntents: string[];
  requiredPermissions: string[];
  outputFormat: AgentOutputFormat;
  temperature: number;
  maxTokens: number;
  model: string | null;
  priority: number;
  isEnabled: boolean;
  restrictedToRoleId: string | null;
}

export interface OrchestratorUser {
  userId: string;
  fullName: string;
  permissions: string[];
  roleIds?: string[];
  currency?: string;
}

export interface OrchestratorInput {
  user: OrchestratorUser;
  message: string;
  channel: ConversationChannel;
  conversationId: string | null;
  /** Prior turns, oldest first, already trimmed by the caller. */
  history: Array<{ role: 'USER' | 'ASSISTANT'; content: string }>;
  /** Forces a specific agent, e.g. when the user picks one in the dashboard. */
  agentKey?: string | null;
  runtime: ToolRuntime;
  agents: AgentConfig[];
}

export interface ToolInvocation {
  name: string;
  args: Record<string, unknown>;
  durationMs: number;
  ok: boolean;
  error?: string;
  result?: unknown;
}

export interface OrchestratorResult extends AgentReply {
  intent: Intent;
  intentConfidence: number;
  agentKey: string;
  agentId: string | null;
  invocations: ToolInvocation[];
  usedLLM: boolean;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
  /** Set when the turn produced a stored purchase decision. */
  purchaseDecisionId: string | null;
}
