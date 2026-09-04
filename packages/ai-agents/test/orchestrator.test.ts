import { describe, expect, it, vi } from 'vitest';
import {
  AgentKey,
  AgentOutputFormat,
  Intent,
  Permission,
  PurchaseVerdict,
  RiskLevel,
  ToolName,
} from '@flowmoney/shared-types';
import { runOrchestrator, selectAgent } from '../src/orchestrator';
import type { AgentConfig, ToolRuntime } from '../src/types';

const CUSTOMER_PERMISSIONS = [
  Permission.USE_AI_CHAT,
  Permission.VIEW_OWN_ACCOUNTS,
  Permission.VIEW_OWN_TRANSACTIONS,
  Permission.VIEW_OWN_BUDGET,
  Permission.VIEW_OWN_FINANCIAL_HEALTH,
  Permission.VIEW_OWN_REPORTS,
  Permission.REQUEST_PURCHASE_ANALYSIS,
  Permission.MANAGE_OWN_SAVINGS_GOALS,
];

function agent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'agent-1',
    key: AgentKey.PURCHASE_ANALYST,
    name: 'Purchase Analyst',
    systemInstructions: 'Evaluate purchases.',
    allowedTools: [ToolName.EVALUATE_PURCHASE, ToolName.GET_USER_FINANCIAL_SNAPSHOT],
    handledIntents: [Intent.PURCHASE_ANALYSIS],
    requiredPermissions: [Permission.REQUEST_PURCHASE_ANALYSIS],
    outputFormat: AgentOutputFormat.WHATSAPP_CARD,
    temperature: 0.2,
    maxTokens: 800,
    model: null,
    priority: 10,
    isEnabled: true,
    restrictedToRoleId: null,
    ...overrides,
  };
}

const advisorAgent = agent({
  id: 'agent-2',
  key: AgentKey.FINANCIAL_ADVISOR,
  name: 'Financial Advisor',
  allowedTools: [ToolName.GET_USER_FINANCIAL_SNAPSHOT, ToolName.CALCULATE_FINANCIAL_HEALTH],
  handledIntents: [Intent.GENERAL_QUESTION, Intent.GREETING, Intent.FINANCIAL_HEALTH],
  requiredPermissions: [Permission.USE_AI_CHAT],
  priority: 100,
});

const snapshot = {
  userId: 'u1',
  asOf: '2026-03-15T00:00:00.000Z',
  currency: 'INR',
  period: { start: '', end: '', daysElapsed: 15, daysRemaining: 16, totalDays: 31 },
  totalBalance: 62_000,
  availableBalance: 62_000,
  discretionaryBudgetRemaining: 12_000,
  savingsTarget: 15_000,
  savingsProgress: 9_000,
  savingsShortfall: 6_000,
  monthlyIncome: 75_000,
  totalSpentThisPeriod: 22_000,
  emergencyFundMonths: 1.55,
  projectedMonthEndSpend: 70_000,
  projectedSavings: 5_000,
  projectedSavingsRatePercent: 6.6,
  upcomingRecurringPayments: 20_000,
  safelySpendableCash: -12_000,
} as never;

const decision = {
  verdict: PurchaseVerdict.NOT_RECOMMENDED,
  score: 8.5,
  confidence: 100,
  purchasePrice: 50_000,
  category: 'shopping',
  merchant: null,
  availableBalance: 62_000,
  safelySpendableCash: -12_000,
  discretionaryBudgetRemaining: 12_000,
  discretionaryBudgetAfter: -38_000,
  affordabilityGap: -38_000,
  budgetImpactPercentage: 416.67,
  essentialExpensesRemaining: 4_000,
  upcomingRecurringPayments: 20_000,
  incomeExpectedRemaining: 0,
  savingsTarget: 15_000,
  projectedSavingsBeforePurchase: 5_000,
  projectedSavingsAfterPurchase: -33_000,
  projectedSavingsRateBefore: 6.6,
  projectedSavingsRateAfter: -44,
  emergencyFundMonths: 1.55,
  emergencyFundMonthsAfter: 0,
  emergencyReserveBreached: true,
  purchaseToIncomeRatio: 66.67,
  purchaseToDiscretionaryRatio: 416.67,
  cashFlowRiskLevel: RiskLevel.CRITICAL,
  debtToIncomeRatioPercent: 0,
  financialHealthScore: 55,
  financialHealthScoreAfter: 32,
  opportunityCost: {
    horizonYears: 5,
    annualRatePercent: 8,
    futureValue: 73_466,
    foregoneGrowth: 23_466,
    assumptionNote: 'Illustrative only.',
  },
  savingPlan: {
    amountToAccumulate: 38_000,
    suggestedMonthlyContribution: 11_500,
    monthsToTarget: 4,
    targetDate: '2026-07-15T00:00:00.000Z',
  },
  recurringImpact: null,
  factors: [],
  primaryReasons: ['Purchase exceeds the cash left after this month’s committed payments'],
  recommendedActions: ['Hold off — this would compromise your reserves.'],
  engineVersion: '1.0.0',
  computedAt: '2026-03-15T00:00:00.000Z',
} as never;

function makeRuntime(overrides: Partial<ToolRuntime> = {}): ToolRuntime {
  return {
    getFinancialSnapshot: vi.fn().mockResolvedValue(snapshot),
    getRecentTransactions: vi.fn().mockResolvedValue([]),
    getBudgetStatus: vi.fn().mockResolvedValue({}),
    evaluatePurchase: vi.fn().mockResolvedValue({ decision, decisionId: 'decision-1' }),
    calculateFinancialHealth: vi.fn().mockResolvedValue({
      score: 55,
      riskLevel: RiskLevel.HIGH,
      components: [],
      strengths: [],
      weaknesses: [],
      computedAt: '',
      engineVersion: '1.0.0',
    }),
    getMonthlyReport: vi.fn().mockResolvedValue({}),
    getSavingsOpportunities: vi.fn().mockResolvedValue({ idleCash: {}, opportunities: [], allocation: null }),
    getInvestmentProfile: vi.fn().mockResolvedValue({}),
    searchFinancialProducts: vi.fn().mockResolvedValue([]),
    detectSpendingAnomalies: vi.fn().mockResolvedValue([]),
    createSavingsGoal: vi.fn().mockResolvedValue({}),
    requestPaymentAuthorization: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as ToolRuntime;
}

const user = { userId: 'u1', fullName: 'Shaun Mathew', permissions: CUSTOMER_PERMISSIONS };

describe('agent selection', () => {
  const agents = [agent(), advisorAgent];

  it('routes a purchase question to the purchase analyst', () => {
    const selected = selectAgent(agents, Intent.PURCHASE_ANALYSIS, CUSTOMER_PERMISSIONS);
    expect(selected?.key).toBe(AgentKey.PURCHASE_ANALYST);
  });

  it('falls back to the general advisor for unhandled intents', () => {
    const selected = selectAgent(agents, Intent.TRANSACTION_LOOKUP, CUSTOMER_PERMISSIONS);
    expect(selected?.key).toBe(AgentKey.FINANCIAL_ADVISOR);
  });

  it('never selects an agent the user lacks permissions for', () => {
    const selected = selectAgent(agents, Intent.PURCHASE_ANALYSIS, [Permission.USE_AI_CHAT]);
    expect(selected?.key).toBe(AgentKey.FINANCIAL_ADVISOR);
  });

  it('honours an explicitly requested agent', () => {
    const selected = selectAgent(
      agents,
      Intent.PURCHASE_ANALYSIS,
      CUSTOMER_PERMISSIONS,
      AgentKey.FINANCIAL_ADVISOR,
    );
    expect(selected?.key).toBe(AgentKey.FINANCIAL_ADVISOR);
  });

  it('ignores disabled agents', () => {
    const selected = selectAgent(
      [agent({ isEnabled: false }), advisorAgent],
      Intent.PURCHASE_ANALYSIS,
      CUSTOMER_PERMISSIONS,
    );
    expect(selected?.key).toBe(AgentKey.FINANCIAL_ADVISOR);
  });
});

describe('orchestrator without an LLM', () => {
  const base = {
    user,
    channel: 'WHATSAPP' as const,
    conversationId: null,
    history: [],
    agents: [agent(), advisorAgent],
  };

  it('calls the purchase engine and reports its verdict verbatim', async () => {
    const runtime = makeRuntime();
    const result = await runOrchestrator(
      { ...base, message: 'Can I buy a PS5 for ₹50,000?', runtime },
      { llm: null },
    );

    expect(result.intent).toBe(Intent.PURCHASE_ANALYSIS);
    expect(result.agentKey).toBe(AgentKey.PURCHASE_ANALYST);
    expect(runtime.evaluatePurchase).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ price: 50_000, category: 'shopping' }),
      expect.objectContaining({ persist: true }),
    );
    // The verdict and every figure must come straight from the engine result.
    expect(result.text).toContain('NOT RECOMMENDED');
    expect(result.text).toContain('8.5/100');
    expect(result.text).toContain('₹50,000');
    expect(result.text).toContain('₹11,500');
    expect(result.purchaseDecisionId).toBe('decision-1');
    expect(result.usedLLM).toBe(false);
  });

  it('asks for the amount rather than guessing one', async () => {
    const runtime = makeRuntime();
    const result = await runOrchestrator(
      { ...base, message: 'should I buy a new phone?', runtime },
      { llm: null },
    );
    expect(runtime.evaluatePurchase).not.toHaveBeenCalled();
    expect(result.text.toLowerCase()).toContain('how much');
  });

  it('refuses a tool the user has no permission for', async () => {
    const runtime = makeRuntime();
    const result = await runOrchestrator(
      {
        ...base,
        message: 'Can I buy a PS5 for ₹50,000?',
        runtime,
        user: { ...user, permissions: [Permission.USE_AI_CHAT, Permission.VIEW_OWN_ACCOUNTS] },
      },
      { llm: null },
    );
    // Falls back to the advisor, and the purchase engine is never reached.
    expect(runtime.evaluatePurchase).not.toHaveBeenCalled();
    expect(result.agentKey).toBe(AgentKey.FINANCIAL_ADVISOR);
  });

  it('records a tool trace for every call', async () => {
    const runtime = makeRuntime();
    const result = await runOrchestrator(
      { ...base, message: 'Can I afford a 50000 PS5?', runtime },
      { llm: null },
    );
    expect(result.invocations).toHaveLength(1);
    expect(result.invocations[0]?.name).toBe(ToolName.EVALUATE_PURCHASE);
    expect(result.invocations[0]?.ok).toBe(true);
    expect(result.trace.toolsUsed[0]?.name).toBe(ToolName.EVALUATE_PURCHASE);
  });

  it('survives a tool that throws', async () => {
    const runtime = makeRuntime({
      evaluatePurchase: vi.fn().mockRejectedValue(new Error('database unavailable')),
    });
    const result = await runOrchestrator(
      { ...base, message: 'Can I afford a 50000 PS5?', runtime },
      { llm: null },
    );
    expect(result.invocations[0]?.ok).toBe(false);
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('greets with real balances rather than pleasantries alone', async () => {
    const runtime = makeRuntime();
    const result = await runOrchestrator({ ...base, message: 'hey', runtime }, { llm: null });
    expect(result.agentKey).toBe(AgentKey.FINANCIAL_ADVISOR);
    expect(result.text).toContain('₹62,000');
  });
});
