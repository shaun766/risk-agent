/**
 * Zod schemas for every API boundary. The API validates with these; the web app
 * imports the inferred types so a route contract can never silently drift.
 */
import { z } from 'zod';
import {
  AgentOutputFormat,
  AllocationBucket,
  BudgetRuleType,
  BudgetStrategy,
  ConversationChannel,
  FinancialProductType,
  InvestmentHorizon,
  LiquidityLevel,
  RiskTolerance,
  ToolName,
  TransactionDirection,
} from './enums';

const enumOf = <T extends Record<string, string>>(e: T) =>
  z.enum(Object.values(e) as [string, ...string[]]);

export const uuid = z.string().uuid();
export const isoDate = z.string().datetime({ offset: true }).or(z.string().date());
/** YYYY-MM */
export const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

export const moneyAmount = z
  .number()
  .finite()
  .nonnegative()
  .max(1_000_000_000, 'Amount exceeds supported range');

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200)
  .refine((v) => /[a-z]/.test(v), 'Must contain a lowercase letter')
  .refine((v) => /[A-Z]/.test(v), 'Must contain an uppercase letter')
  .refine((v) => /[0-9]/.test(v), 'Must contain a digit');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Expected an E.164 phone number, e.g. +919876543210');

// ---------------------------------------------------------------- auth --

export const registerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: passwordSchema,
  fullName: z.string().trim().min(2).max(120),
  phone: phoneSchema.optional(),
  monthlyIncome: moneyAmount.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(10).optional() });

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  occupation: z.string().trim().max(120).nullish(),
  city: z.string().trim().max(120).nullish(),
  declaredMonthlyIncome: moneyAmount.nullish(),
  emergencyFundTargetMonths: z.number().min(0).max(36).optional(),
  emergencyReserveAmount: moneyAmount.nullish(),
  monthlyDebtPayments: moneyAmount.optional(),
  whatsappOptIn: z.boolean().optional(),
  voiceRepliesEnabled: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ------------------------------------------------------------ pagination --

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------- transactions --

export const transactionQuerySchema = paginationSchema.extend({
  accountId: uuid.optional(),
  categoryKey: z.string().max(60).optional(),
  direction: enumOf(TransactionDirection).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().nonnegative().optional(),
  search: z.string().trim().max(120).optional(),
});
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

export const transactionSummaryQuerySchema = z.object({
  month: monthKey.optional(),
  groupBy: z.enum(['category', 'merchant', 'day', 'week']).default('category'),
});

// --------------------------------------------------------------- budget --

export const budgetRuleSchema = z.object({
  type: enumOf(BudgetRuleType),
  categoryKey: z.string().max(60).nullable().optional(),
  amount: moneyAmount,
  label: z.string().trim().min(2).max(120),
});

export const budgetAllocationSchema = z.object({
  categoryKey: z.string().min(1).max(60),
  allocated: moneyAmount,
});

const percentSplit = {
  needsPercent: z.number().min(0).max(100),
  wantsPercent: z.number().min(0).max(100),
  savingsPercent: z.number().min(0).max(100),
  investmentsPercent: z.number().min(0).max(100).default(0),
  debtPercent: z.number().min(0).max(100).default(0),
};

export const createBudgetSchema = z
  .object({
    strategy: enumOf(BudgetStrategy),
    month: monthKey.optional(),
    monthlyIncome: moneyAmount.optional(),
    ...percentSplit,
    allocations: z.array(budgetAllocationSchema).max(40).optional(),
    rules: z.array(budgetRuleSchema).max(40).optional(),
  })
  .partial({ needsPercent: true, wantsPercent: true, savingsPercent: true })
  .superRefine((val, ctx) => {
    if (val.strategy !== BudgetStrategy.CUSTOM) return;
    const total =
      (val.needsPercent ?? 0) +
      (val.wantsPercent ?? 0) +
      (val.savingsPercent ?? 0) +
      (val.investmentsPercent ?? 0) +
      (val.debtPercent ?? 0);
    if (Math.abs(total - 100) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Custom budget percentages must total 100 (received ${total})`,
        path: ['needsPercent'],
      });
    }
  });
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

export const updateBudgetSchema = z.object({
  monthlyIncome: moneyAmount.optional(),
  needsPercent: z.number().min(0).max(100).optional(),
  wantsPercent: z.number().min(0).max(100).optional(),
  savingsPercent: z.number().min(0).max(100).optional(),
  investmentsPercent: z.number().min(0).max(100).optional(),
  debtPercent: z.number().min(0).max(100).optional(),
  allocations: z.array(budgetAllocationSchema).max(40).optional(),
  rules: z.array(budgetRuleSchema).max(40).optional(),
});
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

// ------------------------------------------------------------- purchase --

export const purchaseAnalyzeSchema = z.object({
  price: z.number().finite().positive().max(1_000_000_000),
  category: z.string().trim().min(1).max(60).default('shopping'),
  merchant: z.string().trim().max(120).nullish(),
  description: z.string().trim().max(400).nullish(),
  purchaseDate: isoDate.nullish(),
  isRecurring: z.boolean().default(false),
  monthlyCost: z.number().finite().nonnegative().max(10_000_000).nullish(),
  importance: z.number().int().min(1).max(5).nullish(),
  persist: z.boolean().default(true),
});
export type PurchaseAnalyzeInput = z.infer<typeof purchaseAnalyzeSchema>;

// ------------------------------------------------------------ savings goal --

export const savingsGoalSchema = z.object({
  name: z.string().trim().min(2).max(120),
  targetAmount: moneyAmount.refine((v) => v > 0, 'Target must be greater than zero'),
  currentAmount: moneyAmount.default(0),
  targetDate: isoDate.nullish(),
  monthlyContribution: moneyAmount.default(0),
  categoryKey: z.string().max(60).nullish(),
});
export type SavingsGoalInput = z.infer<typeof savingsGoalSchema>;

// ------------------------------------------------------------------- AI --

export const aiChatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: uuid.nullish(),
  channel: enumOf(ConversationChannel).default(ConversationChannel.WEB),
  agentKey: z.string().max(60).nullish(),
});
export type AIChatInput = z.infer<typeof aiChatSchema>;

// ------------------------------------------------------------ investments --

export const investmentProfileSchema = z.object({
  riskTolerance: enumOf(RiskTolerance),
  horizon: enumOf(InvestmentHorizon),
  monthlyInvestmentCapacity: moneyAmount.default(0),
  hasEmergencyFund: z.boolean().default(false),
  liquidityNeedsMonths: z.number().min(0).max(60).default(6),
  experienceLevel: z.enum(['NONE', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
  goals: z.array(z.string().max(120)).max(10).default([]),
});
export type InvestmentProfileInput = z.infer<typeof investmentProfileSchema>;

export const allocationQuerySchema = z.object({
  surplus: z.coerce.number().positive().max(1_000_000_000).optional(),
});

// --------------------------------------------------------------- payments --

export const createPaymentIntentSchema = z.object({
  amount: z.number().finite().positive().max(1_000_000_000),
  accountId: uuid,
  merchant: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).optional(),
  categoryKey: z.string().max(60).default('shopping'),
  purchaseDecisionId: uuid.nullish(),
});
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

export const confirmPaymentSchema = z.object({
  /** Must be the literal string the API returned in the intent. Typo = rejected. */
  confirmationPhrase: z.string().min(1).max(120),
});

// ------------------------------------------------------------------ admin --

export const createAgentSchema = z.object({
  key: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[A-Z0-9_]+$/, 'Agent key must be UPPER_SNAKE_CASE'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).default(''),
  systemInstructions: z.string().trim().min(20).max(20_000),
  allowedTools: z.array(enumOf(ToolName)).max(20).default([]),
  requiredPermissions: z.array(z.string().max(60)).max(30).default([]),
  outputFormat: enumOf(AgentOutputFormat).default(AgentOutputFormat.CONVERSATIONAL),
  handledIntents: z.array(z.string().max(60)).max(20).default([]),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().int().min(64).max(8000).default(900),
  model: z.string().max(60).nullish(),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(100),
});
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const updateAgentSchema = createAgentSchema.partial().omit({ key: true });
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

export const createRoleSchema = z.object({
  key: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[A-Z0-9_]+$/, 'Role key must be UPPER_SNAKE_CASE'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(400).default(''),
  permissions: z.array(z.string().max(60)).max(100).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = createRoleSchema.partial().omit({ key: true });

export const assignRoleSchema = z.object({ userId: uuid, roleKey: z.string().min(2).max(60) });

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: enumOf(FinancialProductType),
  riskLevel: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']),
  liquidity: enumOf(LiquidityLevel),
  minimumInvestment: moneyAmount.default(0),
  interestRate: z.number().min(-20).max(100).default(0),
  expectedReturnLow: z.number().min(-50).max(100).default(0),
  expectedReturnHigh: z.number().min(-50).max(100).default(0),
  lockInMonths: z.number().int().min(0).max(600).default(0),
  description: z.string().trim().max(1200).default(''),
  bucket: enumOf(AllocationBucket).nullish(),
  isActive: z.boolean().default(true),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();

export const adminUserQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  roleKey: z.string().max(60).optional(),
  status: z.string().max(40).optional(),
});

// ---------------------------------------------------------------- reports --

export const reportQuerySchema = z.object({
  regenerate: z.coerce.boolean().default(false),
});

// ------------------------------------------------------------- API errors --

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}
