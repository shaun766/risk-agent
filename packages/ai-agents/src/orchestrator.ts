import {
  AgentKey,
  Intent,
  RiskLevel,
  ToolName,
  type FinancialSnapshot,
  type PurchaseDecision,
  type StructuredAIResponse,
} from '@flowmoney/shared-types';
import { classifyIntent } from './intent';
import { buildSystemPrompt, chatCompletion, structureResponse, type LLMConfig, type LLMMessage } from './llm';
import * as render from './renderer';
import { executeTool, resolveAvailableTools, type ToolDefinition } from './tools';
import type {
  AgentConfig,
  DeletedTransactionView,
  LoggedTransactionView,
  OrchestratorInput,
  OrchestratorResult,
  ToolInvocation,
  TransactionSummaryRow,
} from './types';

/** Hard stop on the tool loop so a confused model cannot spend money forever. */
const MAX_TOOL_ROUNDS = 4;
const MAX_HISTORY_TURNS = 8;

export interface OrchestratorOptions {
  llm: LLMConfig | null;
}

/**
 * Chooses which agent handles a turn.
 *
 * Selection is data-driven: agents declare the intents they handle and the
 * permissions they need, and both come from database rows an administrator can
 * change at runtime. There is no switch statement on agent names.
 */
export function selectAgent(
  agents: AgentConfig[],
  intent: Intent,
  userPermissions: string[],
  preferredKey?: string | null,
): AgentConfig | null {
  const usable = agents.filter(
    (agent) =>
      agent.isEnabled &&
      agent.requiredPermissions.every((permission) => userPermissions.includes(permission)),
  );

  if (preferredKey) {
    const preferred = usable.find((agent) => agent.key === preferredKey);
    if (preferred) return preferred;
  }

  const handlers = usable
    .filter((agent) => agent.handledIntents.includes(intent))
    .sort((a, b) => a.priority - b.priority);
  if (handlers[0]) return handlers[0];

  // Fall back to the general advisor, then to whatever is available.
  return (
    usable.find((agent) => agent.key === AgentKey.FINANCIAL_ADVISOR) ??
    usable.sort((a, b) => a.priority - b.priority)[0] ??
    null
  );
}

/** Which tool an intent needs when running without a language model. */
const DETERMINISTIC_PLAN: Partial<Record<Intent, string[]>> = {
  [Intent.PURCHASE_ANALYSIS]: [ToolName.EVALUATE_PURCHASE],
  [Intent.MONTHLY_FINANCIAL_SUMMARY]: [ToolName.GET_MONTHLY_REPORT],
  [Intent.FINANCIAL_BEHAVIOR_ANALYSIS]: [ToolName.GET_BUDGET_STATUS],
  [Intent.SAVINGS_OPTIMIZATION]: [ToolName.GET_SAVINGS_OPPORTUNITIES],
  [Intent.CASH_ALLOCATION_GUIDANCE]: [ToolName.GET_SAVINGS_OPPORTUNITIES],
  [Intent.INVESTMENT_EDUCATION]: [ToolName.GET_SAVINGS_OPPORTUNITIES],
  [Intent.BUDGET_MANAGEMENT]: [ToolName.GET_BUDGET_STATUS],
  [Intent.TRANSACTION_LOOKUP]: [ToolName.GET_RECENT_TRANSACTIONS],
  [Intent.FINANCIAL_HEALTH]: [ToolName.CALCULATE_FINANCIAL_HEALTH],
  [Intent.ANOMALY_CHECK]: [ToolName.DETECT_SPENDING_ANOMALIES],
  [Intent.GREETING]: [ToolName.GET_USER_FINANCIAL_SNAPSHOT],
  [Intent.GENERAL_QUESTION]: [ToolName.GET_USER_FINANCIAL_SNAPSHOT],
  [Intent.UNKNOWN]: [ToolName.GET_USER_FINANCIAL_SNAPSHOT],
};

function toolSummaryFor(invocations: ToolInvocation[]): string {
  return invocations
    .filter((invocation) => invocation.ok)
    .map((invocation) => `${invocation.name}: ${JSON.stringify(invocation.result).slice(0, 4000)}`)
    .join('\n\n');
}

/**
 * Runs one conversational turn.
 *
 * The contract that matters: every number in the reply originates from a tool
 * result computed by the deterministic financial engine. When an OpenAI key is
 * configured the model phrases those numbers; when it is not, templates do.
 * Neither path lets the model produce a figure of its own.
 */
export async function runOrchestrator(
  input: OrchestratorInput,
  options: OrchestratorOptions,
): Promise<OrchestratorResult> {
  const startedAt = Date.now();
  const classification = classifyIntent(input.message);
  const agent = selectAgent(
    input.agents,
    classification.intent,
    input.user.permissions,
    input.agentKey,
  );

  const invocations: ToolInvocation[] = [];
  let purchaseDecisionId: string | null = null;
  // Declared here rather than beside the LLM loop: `finish` closes over them and
  // is reachable from the deterministic path, which runs first.
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;

  const toolContext = {
    userId: input.user.userId,
    channel: input.channel,
    conversationId: input.conversationId,
    runtime: input.runtime,
    onPurchaseDecision: (id: string | null) => {
      purchaseDecisionId = id;
    },
  };

  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const began = Date.now();
    try {
      const result = await executeTool(name, args, toolContext);
      invocations.push({ name, args, durationMs: Date.now() - began, ok: true, result });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      invocations.push({ name, args, durationMs: Date.now() - began, ok: false, error: message });
      return { error: message };
    }
  };

  if (!agent) {
    return finish({
      text: 'No AI agent is available for your account. Please contact support.',
      structured: {
        summary: 'No agent available.',
        recommendation: 'Contact support.',
        reasons: [],
        nextActions: [],
        riskLevel: RiskLevel.MODERATE,
      },
      quickActions: [],
      agentKey: 'NONE',
      agentId: null,
      usedLLM: false,
      model: 'none',
    });
  }

  const availableTools = resolveAvailableTools(agent.allowedTools, input.user.permissions);

  // ------------------------------------------------------- deterministic path
  if (!options.llm) {
    const reply = await runDeterministic(input, classification, availableTools, call);
    return finish({
      ...reply,
      agentKey: agent.key,
      agentId: agent.id,
      usedLLM: false,
      model: 'deterministic-renderer',
    });
  }

  // -------------------------------------------------------------- LLM path
  const systemPrompt = buildSystemPrompt(agent.systemInstructions, {
    userName: input.user.fullName,
    currency: input.user.currency ?? 'INR',
    today: new Date().toISOString().slice(0, 10),
    channel: input.channel,
  });

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...input.history.slice(-MAX_HISTORY_TURNS).map((turn) => ({
      role: turn.role === 'USER' ? ('user' as const) : ('assistant' as const),
      content: turn.content,
    })),
    { role: 'user', content: input.message },
  ];

  // A purchase question always gets the engine result in front of the model,
  // whether or not the model thinks to ask for it.
  if (
    classification.intent === Intent.PURCHASE_ANALYSIS &&
    classification.purchase?.price &&
    availableTools.some((tool) => tool.name === ToolName.EVALUATE_PURCHASE)
  ) {
    const decision = await call(ToolName.EVALUATE_PURCHASE, {
      price: classification.purchase.price,
      category: classification.purchase.category,
      description: classification.purchase.description,
      isRecurring: classification.purchase.isRecurring,
      monthlyCost: classification.purchase.monthlyCost,
      importance: classification.purchase.importance,
    });
    messages.push({
      role: 'assistant',
      content: `[engine] evaluate_purchase returned: ${JSON.stringify(decision)}`,
    });
  }

  // Same reasoning as the purchase case: money the user says already moved
  // gets written to their ledger deterministically, not left to the model to
  // decide whether or how to call it.
  if (
    classification.intent === Intent.LOG_TRANSACTION &&
    classification.transaction?.amount &&
    availableTools.some((tool) => tool.name === ToolName.LOG_TRANSACTION)
  ) {
    const logged = await call(ToolName.LOG_TRANSACTION, {
      amount: classification.transaction.amount,
      direction: classification.transaction.direction,
      categoryKey: classification.transaction.categoryKey,
      description: classification.transaction.description,
      merchant: classification.transaction.merchant,
      isRecurring: classification.transaction.isRecurring,
    });
    messages.push({
      role: 'assistant',
      content: `[engine] log_transaction returned: ${JSON.stringify(logged)}`,
    });
  }

  let narrative = '';

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const turn = await chatCompletion(options.llm, messages, availableTools, {
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
      });
      promptTokens = turn.promptTokens ?? promptTokens;
      completionTokens = turn.completionTokens ?? completionTokens;

      if (turn.toolCalls.length === 0) {
        narrative = turn.content ?? '';
        break;
      }

      messages.push({
        role: 'assistant',
        content: turn.content ?? '',
        tool_calls: turn.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: 'function' as const,
          function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) },
        })),
      });

      for (const toolCall of turn.toolCalls) {
        const allowed = availableTools.some((tool) => tool.name === toolCall.name);
        const result = allowed
          ? await call(toolCall.name, toolCall.args)
          : { error: `Tool ${toolCall.name} is not available to this agent or user.` };
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result).slice(0, 12_000),
        });
      }
    }
  } catch (error) {
    // Any LLM failure falls back to the deterministic renderer rather than
    // surfacing an error to a user asking about their money.
    const reply = await runDeterministic(input, classification, availableTools, call);
    return finish({
      ...reply,
      text: reply.text,
      agentKey: agent.key,
      agentId: agent.id,
      usedLLM: false,
      model: 'deterministic-renderer (LLM unavailable)',
      llmError: error instanceof Error ? error.message : String(error),
    });
  }

  if (!narrative.trim()) {
    const reply = await runDeterministic(input, classification, availableTools, call);
    return finish({
      ...reply,
      agentKey: agent.key,
      agentId: agent.id,
      usedLLM: false,
      model: 'deterministic-renderer (empty completion)',
    });
  }

  const structured =
    (await structureResponse(options.llm, narrative, toolSummaryFor(invocations))) ??
    deterministicStructure(invocations, narrative);

  return finish({
    text: narrative.trim(),
    structured,
    quickActions: quickActionsFor(classification.intent),
    agentKey: agent.key,
    agentId: agent.id,
    usedLLM: true,
    model: options.llm.model,
  });

  // -------------------------------------------------------------- helpers

  function finish(partial: {
    text: string;
    structured: StructuredAIResponse;
    quickActions: Array<{ label: string; command: string }>;
    agentKey: string;
    agentId: string | null;
    usedLLM: boolean;
    model: string;
    llmError?: string;
  }): OrchestratorResult {
    return {
      text: partial.text,
      structured: partial.structured,
      quickActions: partial.quickActions,
      intent: classification.intent,
      intentConfidence: classification.confidence,
      agentKey: partial.agentKey,
      agentId: partial.agentId,
      invocations,
      usedLLM: partial.usedLLM,
      model: partial.model,
      promptTokens,
      completionTokens,
      latencyMs: Date.now() - startedAt,
      purchaseDecisionId,
      trace: {
        conversationId: input.conversationId ?? '',
        messageId: '',
        intent: classification.intent,
        intentConfidence: classification.confidence,
        agentKey: partial.agentKey,
        agentId: partial.agentId,
        toolsUsed: invocations.map((invocation) => ({
          name: invocation.name,
          durationMs: invocation.durationMs,
          ok: invocation.ok,
          argsSummary: invocation.args,
        })),
        snapshotId: null,
        model: partial.model,
        usedLLM: partial.usedLLM,
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - startedAt,
      },
    };
  }
}

function quickActionsFor(intent: Intent): Array<{ label: string; command: string }> {
  switch (intent) {
    case Intent.PURCHASE_ANALYSIS:
      return [
        { label: 'Show detailed analysis', command: 'show detailed analysis' },
        { label: 'Create savings goal', command: 'create a savings goal for this' },
      ];
    case Intent.BUDGET_MANAGEMENT:
      return [{ label: 'Adjust budget', command: 'adjust my budget' }];
    default:
      return [
        { label: 'How am I doing?', command: 'how am I doing financially' },
        { label: 'This month’s spending', command: 'how much did I spend this month' },
      ];
  }
}

function deterministicStructure(
  invocations: ToolInvocation[],
  narrative: string,
): StructuredAIResponse {
  const purchase = invocations.find(
    (invocation) => invocation.name === ToolName.EVALUATE_PURCHASE && invocation.ok,
  )?.result as PurchaseDecision | undefined;

  if (purchase) {
    return {
      summary: `${purchase.verdict.replace(/_/g, ' ')} — score ${purchase.score}/100.`,
      recommendation: purchase.recommendedActions[0] ?? narrative.slice(0, 200),
      reasons: purchase.primaryReasons,
      nextActions: purchase.recommendedActions,
      riskLevel: purchase.cashFlowRiskLevel,
    };
  }

  return {
    summary: narrative.slice(0, 220),
    recommendation: narrative.slice(0, 220),
    reasons: [],
    nextActions: [],
    riskLevel: RiskLevel.MODERATE,
  };
}

/**
 * The no-LLM path. It calls exactly the tool the intent needs and renders the
 * result with a template — the platform stays fully functional without an
 * OpenAI key, which also makes the whole flow testable in CI.
 */
async function runDeterministic(
  input: OrchestratorInput,
  classification: ReturnType<typeof classifyIntent>,
  availableTools: ToolDefinition[],
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>,
): Promise<{
  text: string;
  structured: StructuredAIResponse;
  quickActions: Array<{ label: string; command: string }>;
}> {
  const canUse = (name: string) => availableTools.some((tool) => tool.name === name);
  const plan = DETERMINISTIC_PLAN[classification.intent] ?? [ToolName.GET_USER_FINANCIAL_SNAPSHOT];

  if (classification.intent === Intent.PURCHASE_ANALYSIS) {
    if (!classification.purchase?.price) {
      return {
        text: 'How much does it cost? Send me the amount — for example "can I afford a ₹18,000 phone?" — and I will run the numbers.',
        structured: {
          summary: 'Purchase amount missing.',
          recommendation: 'Send the price so the affordability engine can run.',
          reasons: [],
          nextActions: [],
          riskLevel: RiskLevel.LOW,
        },
        quickActions: [],
      };
    }
    if (canUse(ToolName.EVALUATE_PURCHASE)) {
      const decision = (await call(ToolName.EVALUATE_PURCHASE, {
        price: classification.purchase.price,
        category: classification.purchase.category,
        description: classification.purchase.description,
        isRecurring: classification.purchase.isRecurring,
        monthlyCost: classification.purchase.monthlyCost,
        importance: classification.purchase.importance,
      })) as PurchaseDecision;
      if (decision && 'verdict' in decision) {
        return render.renderPurchaseDecision(decision, input.user.fullName);
      }
    }
  }

  if (classification.intent === Intent.LOG_TRANSACTION) {
    if (!classification.transaction?.amount) {
      return {
        text: 'How much, and what for? For example "spent 500 on lunch" or "log 1200 for the electrician".',
        structured: {
          summary: 'Transaction amount missing.',
          recommendation: 'Send the amount so it can be logged.',
          reasons: [],
          nextActions: [],
          riskLevel: RiskLevel.LOW,
        },
        quickActions: [],
      };
    }
    if (canUse(ToolName.LOG_TRANSACTION)) {
      const logged = (await call(ToolName.LOG_TRANSACTION, {
        amount: classification.transaction.amount,
        direction: classification.transaction.direction,
        categoryKey: classification.transaction.categoryKey,
        description: classification.transaction.description,
        merchant: classification.transaction.merchant,
        isRecurring: classification.transaction.isRecurring,
      })) as LoggedTransactionView;
      if (logged && 'id' in logged) {
        return render.renderTransactionLogged(logged);
      }
    }
  }

  if (classification.intent === Intent.DELETE_TRANSACTION) {
    if (canUse(ToolName.GET_RECENT_TRANSACTIONS) && canUse(ToolName.DELETE_TRANSACTION)) {
      const recent = (await call(ToolName.GET_RECENT_TRANSACTIONS, { limit: 10 })) as TransactionSummaryRow[];
      const candidates = Array.isArray(recent) ? recent : [];

      const target = classification.deletion?.amount
        ? candidates.filter((t) => Math.abs(t.amount - (classification.deletion!.amount as number)) < 0.01)
        : classification.deletion?.mostRecent
          ? candidates.slice(0, 1)
          : [];

      if (target.length === 1 && target[0]) {
        const deleted = (await call(ToolName.DELETE_TRANSACTION, {
          transactionId: target[0].id,
        })) as DeletedTransactionView;
        if (deleted && 'id' in deleted) {
          return render.renderTransactionDeleted(deleted);
        }
      }

      return render.renderDeletionAmbiguous(target.length > 1 ? target : candidates.slice(0, 5));
    }
  }

  for (const toolName of plan) {
    if (!canUse(toolName)) continue;
    const result = await call(toolName, toolName === ToolName.GET_RECENT_TRANSACTIONS ? { limit: 15 } : {});
    if (!result || (typeof result === 'object' && 'error' in (result as object))) continue;

    switch (toolName) {
      case ToolName.GET_MONTHLY_REPORT:
        return render.renderMonthlyReport(result as Parameters<typeof render.renderMonthlyReport>[0]);
      case ToolName.GET_BUDGET_STATUS:
        return render.renderBudget(result as Parameters<typeof render.renderBudget>[0]);
      case ToolName.CALCULATE_FINANCIAL_HEALTH:
        return render.renderHealth(result as Parameters<typeof render.renderHealth>[0]);
      case ToolName.DETECT_SPENDING_ANOMALIES:
        return render.renderAnomalies(result as Parameters<typeof render.renderAnomalies>[0]);
      case ToolName.GET_RECENT_TRANSACTIONS:
        return render.renderTransactions(result as Parameters<typeof render.renderTransactions>[0]);
      case ToolName.GET_SAVINGS_OPPORTUNITIES: {
        const savings = result as {
          idleCash: Parameters<typeof render.renderSavings>[0];
          opportunities: Parameters<typeof render.renderSavings>[1];
          allocation: Parameters<typeof render.renderSavings>[2];
        };
        return render.renderSavings(savings.idleCash, savings.opportunities, savings.allocation);
      }
      case ToolName.GET_USER_FINANCIAL_SNAPSHOT: {
        const snapshot = result as FinancialSnapshot;
        return classification.intent === Intent.GREETING
          ? render.renderGreeting(input.user.fullName, snapshot)
          : render.renderSnapshot(snapshot, input.user.fullName);
      }
      default:
        break;
    }
  }

  const snapshot = canUse(ToolName.GET_USER_FINANCIAL_SNAPSHOT)
    ? ((await call(ToolName.GET_USER_FINANCIAL_SNAPSHOT, {})) as FinancialSnapshot)
    : null;
  return render.renderFallback(classification.intent, snapshot);
}
