import { Permission, ToolName, type ConversationChannel } from '@flowmoney/shared-types';
import type { ToolRuntime } from './types';

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the model's arguments. */
  parameters: Record<string, unknown>;
  /** Permissions the *user* must hold before this tool is offered. */
  requiredPermissions: string[];
  /** True when the tool changes state; used to keep read-only agents read-only. */
  mutating: boolean;
}

const noArgs = { type: 'object', properties: {}, additionalProperties: false } as const;

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  [ToolName.GET_USER_FINANCIAL_SNAPSHOT]: {
    name: ToolName.GET_USER_FINANCIAL_SNAPSHOT,
    description:
      "The user's complete current financial position: balances, income, spending so far this month, discretionary budget remaining, savings target and progress, emergency fund cover, upcoming obligations and projections. Call this before making any statement about their finances.",
    parameters: noArgs,
    requiredPermissions: [Permission.VIEW_OWN_ACCOUNTS],
    mutating: false,
  },
  [ToolName.GET_RECENT_TRANSACTIONS]: {
    name: ToolName.GET_RECENT_TRANSACTIONS,
    description:
      'Recent transactions, most recent first. Use when the user asks about specific spending, a merchant, or a category.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'How many to return (default 20).' },
        days: { type: 'integer', minimum: 1, maximum: 365, description: 'Look back this many days (default 30).' },
        categoryKey: {
          type: 'string',
          description: 'Restrict to one category, e.g. "dining", "shopping", "housing".',
        },
      },
      additionalProperties: false,
    },
    requiredPermissions: [Permission.VIEW_OWN_TRANSACTIONS],
    mutating: false,
  },
  [ToolName.GET_BUDGET_STATUS]: {
    name: ToolName.GET_BUDGET_STATUS,
    description:
      'Budget performance for the current month: planned versus actual per envelope, per-category utilisation, rule violations, projected overspend and the safe daily spend for the days remaining.',
    parameters: noArgs,
    requiredPermissions: [Permission.VIEW_OWN_BUDGET],
    mutating: false,
  },
  [ToolName.EVALUATE_PURCHASE]: {
    name: ToolName.EVALUATE_PURCHASE,
    description:
      'Run the deterministic purchase decision engine. Returns a verdict (SMART_BUY, AFFORDABLE_BUT_CAUTION, WAIT_AND_SAVE, NOT_RECOMMENDED), a 0-100 affordability score, every intermediate figure and a saving plan when the purchase is not affordable now. You MUST call this before advising on any purchase, and you must not alter its verdict or numbers.',
    parameters: {
      type: 'object',
      properties: {
        price: { type: 'number', minimum: 0.01, description: 'Total purchase price in the user\'s currency.' },
        category: {
          type: 'string',
          description: 'Spending category, e.g. shopping, travel, dining, entertainment, education.',
        },
        merchant: { type: 'string', description: 'Merchant or seller, if known.' },
        description: { type: 'string', description: 'What is being bought.' },
        isRecurring: { type: 'boolean', description: 'True if this creates an ongoing monthly cost.' },
        monthlyCost: { type: 'number', minimum: 0, description: 'The ongoing monthly cost, if recurring.' },
        importance: {
          type: 'integer',
          minimum: 1,
          maximum: 5,
          description: 'How necessary the purchase is: 1 impulse, 3 normal, 5 essential.',
        },
      },
      required: ['price', 'category'],
      additionalProperties: false,
    },
    requiredPermissions: [Permission.REQUEST_PURCHASE_ANALYSIS],
    mutating: true,
  },
  [ToolName.CALCULATE_FINANCIAL_HEALTH]: {
    name: ToolName.CALCULATE_FINANCIAL_HEALTH,
    description:
      'The 0-100 financial health score with its six weighted components (savings, budget discipline, emergency fund, debt, cash flow, investments), the risk level, and named strengths and weaknesses.',
    parameters: noArgs,
    requiredPermissions: [Permission.VIEW_OWN_FINANCIAL_HEALTH],
    mutating: false,
  },
  [ToolName.GET_MONTHLY_REPORT]: {
    name: ToolName.GET_MONTHLY_REPORT,
    description:
      'The full monthly report: overview, spending breakdown, budget performance, behavioural insights, health score and trend, savings performance, top merchants, recommendations and next-month forecast.',
    parameters: {
      type: 'object',
      properties: {
        month: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'Month as YYYY-MM. Defaults to the current month.' },
      },
      additionalProperties: false,
    },
    requiredPermissions: [Permission.VIEW_OWN_REPORTS],
    mutating: false,
  },
  [ToolName.GET_SAVINGS_OPPORTUNITIES]: {
    name: ToolName.GET_SAVINGS_OPPORTUNITIES,
    description:
      'Idle cash analysis plus concrete, evidence-backed savings opportunities drawn from the user\'s own transactions, and a suggested allocation plan for any surplus.',
    parameters: noArgs,
    requiredPermissions: [Permission.VIEW_OWN_TRANSACTIONS],
    mutating: false,
  },
  [ToolName.GET_INVESTMENT_PROFILE]: {
    name: ToolName.GET_INVESTMENT_PROFILE,
    description:
      'The user\'s risk tolerance, investment horizon, monthly capacity, experience level, stated goals and current holdings.',
    parameters: noArgs,
    requiredPermissions: [Permission.VIEW_PORTFOLIO],
    mutating: false,
  },
  [ToolName.SEARCH_AVAILABLE_FINANCIAL_PRODUCTS]: {
    name: ToolName.SEARCH_AVAILABLE_FINANCIAL_PRODUCTS,
    description:
      'Search the bank\'s published product catalogue. Use this whenever you mention a product so the rates and minimums you quote are real.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Product type, e.g. FIXED_DEPOSIT, INDEX_FUND, LIQUID_FUND.' },
        riskLevel: { type: 'string', enum: ['LOW', 'MODERATE', 'HIGH'], description: 'Maximum acceptable risk level.' },
        bucket: {
          type: 'string',
          description: 'Allocation bucket: EMERGENCY_FUND, LIQUID_RESERVE, LOW_RISK, LONG_TERM_GROWTH.',
        },
        maxMinimumInvestment: { type: 'number', minimum: 0, description: 'Only products the user can actually afford to enter.' },
      },
      additionalProperties: false,
    },
    requiredPermissions: [Permission.VIEW_FINANCIAL_PRODUCTS],
    mutating: false,
  },
  [ToolName.DETECT_SPENDING_ANOMALIES]: {
    name: ToolName.DETECT_SPENDING_ANOMALIES,
    description:
      'Statistical anomalies in recent transactions: amount outliers, high-value first-time merchants, category spikes, rapid repeat charges and probable duplicates. Reporting only — this cannot block or reverse anything.',
    parameters: noArgs,
    requiredPermissions: [Permission.VIEW_OWN_TRANSACTIONS],
    mutating: false,
  },
  [ToolName.CREATE_SAVINGS_GOAL]: {
    name: ToolName.CREATE_SAVINGS_GOAL,
    description:
      'Create a savings goal for the user. Only call this when the user has clearly asked for it in their message.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 120 },
        targetAmount: { type: 'number', minimum: 1 },
        monthlyContribution: { type: 'number', minimum: 0 },
      },
      required: ['name', 'targetAmount'],
      additionalProperties: false,
    },
    requiredPermissions: [Permission.MANAGE_OWN_SAVINGS_GOALS],
    mutating: true,
  },
  [ToolName.REQUEST_PAYMENT_AUTHORIZATION]: {
    name: ToolName.REQUEST_PAYMENT_AUTHORIZATION,
    description:
      'Prepare a payment for the user to authorise. This does NOT move money: it returns a confirmation phrase the user must send back themselves. Never describe the payment as complete after calling this.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', minimum: 0.01 },
        merchant: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        categoryKey: { type: 'string' },
        accountId: { type: 'string', description: 'Account to debit. Defaults to the primary account.' },
        purchaseDecisionId: { type: 'string', description: 'The analysis this payment follows from, if any.' },
      },
      required: ['amount', 'merchant'],
      additionalProperties: false,
    },
    requiredPermissions: [Permission.AUTHORIZE_OWN_PAYMENT],
    mutating: true,
  },
  [ToolName.LOG_TRANSACTION]: {
    name: ToolName.LOG_TRANSACTION,
    description:
      'Records a transaction the user tells you already happened — money they spent or received. This actually writes to their transaction history and account balance, unlike evaluate_purchase which only simulates. Only call this for something that already occurred, never for a hypothetical or future purchase.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', minimum: 0.01 },
        direction: { type: 'string', enum: ['DEBIT', 'CREDIT'], description: 'DEBIT for an expense, CREDIT for income/refund.' },
        categoryKey: { type: 'string', description: 'e.g. dining, groceries, transport, shopping, salary, other.' },
        description: { type: 'string', minLength: 1, maxLength: 200 },
        merchant: { type: 'string' },
        isRecurring: { type: 'boolean' },
      },
      required: ['amount', 'direction', 'categoryKey', 'description'],
      additionalProperties: false,
    },
    requiredPermissions: [Permission.MANAGE_OWN_TRANSACTIONS],
    mutating: true,
  },
  [ToolName.DELETE_TRANSACTION]: {
    name: ToolName.DELETE_TRANSACTION,
    description:
      'Permanently deletes one of the user\'s own transactions and reverses its effect on their account balance. This cannot be undone. Only call it with a real transactionId you already have from get_recent_transactions in this conversation — never guess an id, and never call this until the user has clearly confirmed which specific transaction (by amount, merchant and date) they want deleted.',
    parameters: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'The id field from a get_recent_transactions result.' },
      },
      required: ['transactionId'],
      additionalProperties: false,
    },
    requiredPermissions: [Permission.MANAGE_OWN_TRANSACTIONS],
    mutating: true,
  },
};

/**
 * Narrows an agent's configured tools to those the *user* is actually
 * permitted to use. An admin can grant an agent a tool, but a customer without
 * the underlying permission will never see it offered — permission checks are
 * not delegated to the model.
 */
export function resolveAvailableTools(
  allowedToolNames: string[],
  userPermissions: string[],
): ToolDefinition[] {
  return allowedToolNames
    .map((name) => TOOL_DEFINITIONS[name])
    .filter((tool): tool is ToolDefinition => Boolean(tool))
    .filter((tool) => tool.requiredPermissions.every((p) => userPermissions.includes(p)));
}

export interface ToolExecutionContext {
  userId: string;
  channel: ConversationChannel;
  conversationId: string | null;
  runtime: ToolRuntime;
  /** Collected so the caller can persist a purchase decision reference. */
  onPurchaseDecision?: (decisionId: string | null) => void;
}

/**
 * Executes a tool by name. Arguments arrive from a language model and are
 * therefore treated as untrusted input: every field is coerced and bounded
 * before it reaches the runtime.
 */
export async function executeTool(
  name: string,
  rawArgs: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<unknown> {
  const { runtime, userId } = context;
  const num = (value: unknown, fallback: number | null = null): number | null => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const str = (value: unknown): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

  switch (name) {
    case ToolName.GET_USER_FINANCIAL_SNAPSHOT:
      return runtime.getFinancialSnapshot(userId);

    case ToolName.GET_RECENT_TRANSACTIONS:
      return runtime.getRecentTransactions(userId, {
        limit: Math.min(Math.max(num(rawArgs.limit, 20) ?? 20, 1), 100),
        days: Math.min(Math.max(num(rawArgs.days, 30) ?? 30, 1), 365),
        categoryKey: str(rawArgs.categoryKey),
      });

    case ToolName.GET_BUDGET_STATUS:
      return runtime.getBudgetStatus(userId);

    case ToolName.EVALUATE_PURCHASE: {
      const price = num(rawArgs.price);
      if (price === null || price <= 0) {
        return { error: 'A positive price is required to evaluate a purchase.' };
      }
      const result = await runtime.evaluatePurchase(
        userId,
        {
          price,
          category: str(rawArgs.category) ?? 'shopping',
          merchant: str(rawArgs.merchant),
          description: str(rawArgs.description),
          isRecurring: rawArgs.isRecurring === true,
          monthlyCost: num(rawArgs.monthlyCost),
          importance: num(rawArgs.importance),
        },
        { persist: true, channel: context.channel, conversationId: context.conversationId },
      );
      context.onPurchaseDecision?.(result.decisionId);
      return result.decision;
    }

    case ToolName.CALCULATE_FINANCIAL_HEALTH:
      return runtime.calculateFinancialHealth(userId);

    case ToolName.GET_MONTHLY_REPORT:
      return runtime.getMonthlyReport(userId, str(rawArgs.month) ?? undefined);

    case ToolName.GET_SAVINGS_OPPORTUNITIES:
      return runtime.getSavingsOpportunities(userId);

    case ToolName.GET_INVESTMENT_PROFILE:
      return runtime.getInvestmentProfile(userId);

    case ToolName.SEARCH_AVAILABLE_FINANCIAL_PRODUCTS:
      return runtime.searchFinancialProducts({
        type: str(rawArgs.type) ?? undefined,
        riskLevel: str(rawArgs.riskLevel) ?? undefined,
        bucket: str(rawArgs.bucket) ?? undefined,
        maxMinimumInvestment: num(rawArgs.maxMinimumInvestment) ?? undefined,
      });

    case ToolName.DETECT_SPENDING_ANOMALIES:
      return runtime.detectSpendingAnomalies(userId);

    case ToolName.CREATE_SAVINGS_GOAL: {
      const targetAmount = num(rawArgs.targetAmount);
      const goalName = str(rawArgs.name);
      if (!goalName || targetAmount === null || targetAmount <= 0) {
        return { error: 'A goal name and a positive target amount are required.' };
      }
      return runtime.createSavingsGoal(userId, {
        name: goalName.slice(0, 120),
        targetAmount,
        monthlyContribution: num(rawArgs.monthlyContribution) ?? 0,
      });
    }

    case ToolName.REQUEST_PAYMENT_AUTHORIZATION: {
      const amount = num(rawArgs.amount);
      const merchant = str(rawArgs.merchant);
      if (amount === null || amount <= 0 || !merchant) {
        return { error: 'A positive amount and a merchant are required.' };
      }
      return runtime.requestPaymentAuthorization(userId, {
        amount,
        merchant,
        description: str(rawArgs.description) ?? undefined,
        categoryKey: str(rawArgs.categoryKey) ?? undefined,
        accountId: str(rawArgs.accountId) ?? undefined,
        purchaseDecisionId: str(rawArgs.purchaseDecisionId),
      });
    }

    case ToolName.LOG_TRANSACTION: {
      const amount = num(rawArgs.amount);
      const direction = str(rawArgs.direction);
      const categoryKey = str(rawArgs.categoryKey);
      const description = str(rawArgs.description);
      if (amount === null || amount <= 0 || (direction !== 'DEBIT' && direction !== 'CREDIT') || !categoryKey || !description) {
        return { error: 'A positive amount, a direction (DEBIT or CREDIT), a category and a description are required.' };
      }
      return runtime.logTransaction(
        userId,
        {
          amount,
          direction,
          categoryKey: categoryKey.slice(0, 60),
          description: description.slice(0, 200),
          merchant: str(rawArgs.merchant),
          isRecurring: rawArgs.isRecurring === true,
        },
        { channel: context.channel },
      );
    }

    case ToolName.DELETE_TRANSACTION: {
      const transactionId = str(rawArgs.transactionId);
      if (!transactionId) {
        return { error: 'A transactionId is required — call get_recent_transactions first to find it.' };
      }
      return runtime.deleteTransaction(userId, transactionId, { channel: context.channel });
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
