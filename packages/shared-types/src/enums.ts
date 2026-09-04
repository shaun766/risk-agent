/**
 * Canonical enum values shared by the database (Prisma), the API, the financial
 * engine and the frontend. Prisma enums mirror these names exactly — if you add
 * a value here, add it to `packages/database/prisma/schema.prisma` too.
 */

function valuesOf<T extends Record<string, string>>(obj: T): Array<T[keyof T]> {
  return Object.values(obj) as Array<T[keyof T]>;
}

// ---------------------------------------------------------------- identity --

export const SystemRole = {
  CUSTOMER: 'CUSTOMER',
  BANK_ADMIN: 'BANK_ADMIN',
  BANK_ANALYST: 'BANK_ANALYST',
  AGENT_ADMIN: 'AGENT_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;
export type SystemRole = (typeof SystemRole)[keyof typeof SystemRole];
export const SYSTEM_ROLES = valuesOf(SystemRole);

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  CLOSED: 'CLOSED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/**
 * Permission keys. Roles are database rows; these strings are the atoms those
 * rows are composed from. Never check a role name in application code — check a
 * permission.
 */
export const Permission = {
  // customer-owned data
  VIEW_OWN_ACCOUNTS: 'VIEW_OWN_ACCOUNTS',
  VIEW_OWN_TRANSACTIONS: 'VIEW_OWN_TRANSACTIONS',
  MANAGE_OWN_TRANSACTIONS: 'MANAGE_OWN_TRANSACTIONS',
  VIEW_OWN_BUDGET: 'VIEW_OWN_BUDGET',
  MANAGE_OWN_BUDGET: 'MANAGE_OWN_BUDGET',
  VIEW_OWN_FINANCIAL_HEALTH: 'VIEW_OWN_FINANCIAL_HEALTH',
  VIEW_OWN_REPORTS: 'VIEW_OWN_REPORTS',
  REQUEST_PURCHASE_ANALYSIS: 'REQUEST_PURCHASE_ANALYSIS',
  VIEW_OWN_PURCHASE_HISTORY: 'VIEW_OWN_PURCHASE_HISTORY',
  MANAGE_OWN_SAVINGS_GOALS: 'MANAGE_OWN_SAVINGS_GOALS',
  MANAGE_OWN_PROFILE: 'MANAGE_OWN_PROFILE',
  LINK_BANK_ACCOUNT: 'LINK_BANK_ACCOUNT',
  USE_AI_CHAT: 'USE_AI_CHAT',
  USE_VOICE_CHANNEL: 'USE_VOICE_CHANNEL',
  AUTHORIZE_OWN_PAYMENT: 'AUTHORIZE_OWN_PAYMENT',

  // investment
  VIEW_PORTFOLIO: 'VIEW_PORTFOLIO',
  MANAGE_INVESTMENT_PROFILE: 'MANAGE_INVESTMENT_PROFILE',
  CREATE_INVESTMENT_RECOMMENDATION: 'CREATE_INVESTMENT_RECOMMENDATION',
  VIEW_RISK_ANALYSIS: 'VIEW_RISK_ANALYSIS',

  // staff — customers
  VIEW_CUSTOMERS: 'VIEW_CUSTOMERS',
  VIEW_CUSTOMER_FINANCIALS: 'VIEW_CUSTOMER_FINANCIALS',
  MANAGE_CUSTOMERS: 'MANAGE_CUSTOMERS',
  IMPERSONATE_CUSTOMER: 'IMPERSONATE_CUSTOMER',

  // staff — analytics
  VIEW_AGGREGATE_ANALYTICS: 'VIEW_AGGREGATE_ANALYTICS',
  VIEW_SYSTEM_ANALYTICS: 'VIEW_SYSTEM_ANALYTICS',
  CONFIGURE_RECOMMENDATION_RULES: 'CONFIGURE_RECOMMENDATION_RULES',
  CONFIGURE_RISK_POLICY: 'CONFIGURE_RISK_POLICY',

  // staff — products
  VIEW_FINANCIAL_PRODUCTS: 'VIEW_FINANCIAL_PRODUCTS',
  MANAGE_FINANCIAL_PRODUCTS: 'MANAGE_FINANCIAL_PRODUCTS',

  // staff — agents
  VIEW_AGENTS: 'VIEW_AGENTS',
  MANAGE_AGENTS: 'MANAGE_AGENTS',
  MANAGE_AGENT_TOOLS: 'MANAGE_AGENT_TOOLS',

  // staff — access control
  VIEW_ROLES: 'VIEW_ROLES',
  MANAGE_ROLES: 'MANAGE_ROLES',
  ASSIGN_ROLES: 'ASSIGN_ROLES',

  // staff — platform
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
  MANAGE_SYSTEM_SETTINGS: 'MANAGE_SYSTEM_SETTINGS',
  REPLAY_WEBHOOKS: 'REPLAY_WEBHOOKS',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];
export const ALL_PERMISSIONS = valuesOf(Permission);

/** Human-readable grouping used by the admin role builder UI. */
export const PERMISSION_GROUPS: Record<string, Permission[]> = {
  'Own finances': [
    Permission.VIEW_OWN_ACCOUNTS,
    Permission.VIEW_OWN_TRANSACTIONS,
    Permission.MANAGE_OWN_TRANSACTIONS,
    Permission.VIEW_OWN_BUDGET,
    Permission.MANAGE_OWN_BUDGET,
    Permission.VIEW_OWN_FINANCIAL_HEALTH,
    Permission.VIEW_OWN_REPORTS,
    Permission.REQUEST_PURCHASE_ANALYSIS,
    Permission.VIEW_OWN_PURCHASE_HISTORY,
    Permission.MANAGE_OWN_SAVINGS_GOALS,
    Permission.MANAGE_OWN_PROFILE,
    Permission.LINK_BANK_ACCOUNT,
    Permission.USE_AI_CHAT,
    Permission.USE_VOICE_CHANNEL,
    Permission.AUTHORIZE_OWN_PAYMENT,
  ],
  Investments: [
    Permission.VIEW_PORTFOLIO,
    Permission.MANAGE_INVESTMENT_PROFILE,
    Permission.CREATE_INVESTMENT_RECOMMENDATION,
    Permission.VIEW_RISK_ANALYSIS,
  ],
  Customers: [
    Permission.VIEW_CUSTOMERS,
    Permission.VIEW_CUSTOMER_FINANCIALS,
    Permission.MANAGE_CUSTOMERS,
    Permission.IMPERSONATE_CUSTOMER,
  ],
  Analytics: [
    Permission.VIEW_AGGREGATE_ANALYTICS,
    Permission.VIEW_SYSTEM_ANALYTICS,
    Permission.CONFIGURE_RECOMMENDATION_RULES,
    Permission.CONFIGURE_RISK_POLICY,
  ],
  Products: [Permission.VIEW_FINANCIAL_PRODUCTS, Permission.MANAGE_FINANCIAL_PRODUCTS],
  Agents: [Permission.VIEW_AGENTS, Permission.MANAGE_AGENTS, Permission.MANAGE_AGENT_TOOLS],
  'Access control': [Permission.VIEW_ROLES, Permission.MANAGE_ROLES, Permission.ASSIGN_ROLES],
  Platform: [
    Permission.VIEW_AUDIT_LOGS,
    Permission.MANAGE_SYSTEM_SETTINGS,
    Permission.REPLAY_WEBHOOKS,
  ],
};

// ----------------------------------------------------------------- banking --

export const BankAccountType = {
  SAVINGS: 'SAVINGS',
  CURRENT: 'CURRENT',
  CREDIT_CARD: 'CREDIT_CARD',
  LOAN: 'LOAN',
  FIXED_DEPOSIT: 'FIXED_DEPOSIT',
  WALLET: 'WALLET',
} as const;
export type BankAccountType = (typeof BankAccountType)[keyof typeof BankAccountType];

export const BankAccountStatus = {
  ACTIVE: 'ACTIVE',
  DORMANT: 'DORMANT',
  CLOSED: 'CLOSED',
} as const;
export type BankAccountStatus = (typeof BankAccountStatus)[keyof typeof BankAccountStatus];

export const TransactionDirection = { CREDIT: 'CREDIT', DEBIT: 'DEBIT' } as const;
export type TransactionDirection =
  (typeof TransactionDirection)[keyof typeof TransactionDirection];

export const TransactionStatus = {
  PENDING: 'PENDING',
  POSTED: 'POSTED',
  FAILED: 'FAILED',
  REVERSED: 'REVERSED',
} as const;
export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

/**
 * How a category behaves in the budget maths. This is the single source of
 * truth for "is this essential spending?" — never infer it from the name.
 */
export const CategoryKind = {
  INCOME: 'INCOME',
  ESSENTIAL: 'ESSENTIAL',
  DISCRETIONARY: 'DISCRETIONARY',
  SAVINGS: 'SAVINGS',
  INVESTMENT: 'INVESTMENT',
  DEBT: 'DEBT',
  TRANSFER: 'TRANSFER',
} as const;
export type CategoryKind = (typeof CategoryKind)[keyof typeof CategoryKind];

// ---------------------------------------------------------------- budgeting --

export const BudgetStrategy = {
  BALANCED: 'BALANCED',
  AGGRESSIVE_SAVINGS: 'AGGRESSIVE_SAVINGS',
  DEBT_REDUCTION: 'DEBT_REDUCTION',
  GROWTH_MODE: 'GROWTH_MODE',
  CUSTOM: 'CUSTOM',
} as const;
export type BudgetStrategy = (typeof BudgetStrategy)[keyof typeof BudgetStrategy];

export const BudgetRuleType = {
  CATEGORY_MAX: 'CATEGORY_MAX',
  CATEGORY_MIN: 'CATEGORY_MIN',
  SAVINGS_MIN: 'SAVINGS_MIN',
  TOTAL_SPEND_MAX: 'TOTAL_SPEND_MAX',
} as const;
export type BudgetRuleType = (typeof BudgetRuleType)[keyof typeof BudgetRuleType];

export const SavingsGoalStatus = {
  ACTIVE: 'ACTIVE',
  ACHIEVED: 'ACHIEVED',
  PAUSED: 'PAUSED',
  CANCELLED: 'CANCELLED',
} as const;
export type SavingsGoalStatus = (typeof SavingsGoalStatus)[keyof typeof SavingsGoalStatus];

// ----------------------------------------------------------------- decisions --

export const PurchaseVerdict = {
  SMART_BUY: 'SMART_BUY',
  AFFORDABLE_BUT_CAUTION: 'AFFORDABLE_BUT_CAUTION',
  WAIT_AND_SAVE: 'WAIT_AND_SAVE',
  NOT_RECOMMENDED: 'NOT_RECOMMENDED',
} as const;
export type PurchaseVerdict = (typeof PurchaseVerdict)[keyof typeof PurchaseVerdict];

export const VERDICT_LABEL: Record<PurchaseVerdict, string> = {
  SMART_BUY: 'Smart Buy',
  AFFORDABLE_BUT_CAUTION: 'Affordable — with caution',
  WAIT_AND_SAVE: 'Wait and save',
  NOT_RECOMMENDED: 'Not recommended',
};

export const RiskLevel = {
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

// --------------------------------------------------------------- investments --

export const RiskTolerance = {
  CONSERVATIVE: 'CONSERVATIVE',
  MODERATE: 'MODERATE',
  AGGRESSIVE: 'AGGRESSIVE',
} as const;
export type RiskTolerance = (typeof RiskTolerance)[keyof typeof RiskTolerance];

export const InvestmentHorizon = {
  SHORT: 'SHORT',
  MEDIUM: 'MEDIUM',
  LONG: 'LONG',
} as const;
export type InvestmentHorizon = (typeof InvestmentHorizon)[keyof typeof InvestmentHorizon];

export const FinancialProductType = {
  SAVINGS_ACCOUNT: 'SAVINGS_ACCOUNT',
  FIXED_DEPOSIT: 'FIXED_DEPOSIT',
  RECURRING_DEPOSIT: 'RECURRING_DEPOSIT',
  LIQUID_FUND: 'LIQUID_FUND',
  DEBT_FUND: 'DEBT_FUND',
  INDEX_FUND: 'INDEX_FUND',
  EQUITY_FUND: 'EQUITY_FUND',
  GOLD: 'GOLD',
  PPF: 'PPF',
  NPS: 'NPS',
  INSURANCE: 'INSURANCE',
  CREDIT_CARD: 'CREDIT_CARD',
  LOAN: 'LOAN',
} as const;
export type FinancialProductType =
  (typeof FinancialProductType)[keyof typeof FinancialProductType];

export const LiquidityLevel = {
  INSTANT: 'INSTANT',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  LOCKED: 'LOCKED',
} as const;
export type LiquidityLevel = (typeof LiquidityLevel)[keyof typeof LiquidityLevel];

export const AllocationBucket = {
  EMERGENCY_FUND: 'EMERGENCY_FUND',
  LIQUID_RESERVE: 'LIQUID_RESERVE',
  LOW_RISK: 'LOW_RISK',
  LONG_TERM_GROWTH: 'LONG_TERM_GROWTH',
  DEBT_REPAYMENT: 'DEBT_REPAYMENT',
  GOAL_FUNDING: 'GOAL_FUNDING',
} as const;
export type AllocationBucket = (typeof AllocationBucket)[keyof typeof AllocationBucket];

// ------------------------------------------------------------------- agents --

export const AgentKey = {
  FINANCIAL_ADVISOR: 'FINANCIAL_ADVISOR',
  PURCHASE_ANALYST: 'PURCHASE_ANALYST',
  BUDGET_COACH: 'BUDGET_COACH',
  RISK_ANALYST: 'RISK_ANALYST',
  INVESTMENT_EDUCATOR: 'INVESTMENT_EDUCATOR',
  MONTHLY_REPORT: 'MONTHLY_REPORT',
  SAVINGS_OPTIMIZER: 'SAVINGS_OPTIMIZER',
  ANOMALY_WATCH: 'ANOMALY_WATCH',
} as const;
export type AgentKey = (typeof AgentKey)[keyof typeof AgentKey];

export const Intent = {
  PURCHASE_ANALYSIS: 'PURCHASE_ANALYSIS',
  MONTHLY_FINANCIAL_SUMMARY: 'MONTHLY_FINANCIAL_SUMMARY',
  FINANCIAL_BEHAVIOR_ANALYSIS: 'FINANCIAL_BEHAVIOR_ANALYSIS',
  SAVINGS_OPTIMIZATION: 'SAVINGS_OPTIMIZATION',
  CASH_ALLOCATION_GUIDANCE: 'CASH_ALLOCATION_GUIDANCE',
  INVESTMENT_EDUCATION: 'INVESTMENT_EDUCATION',
  BUDGET_MANAGEMENT: 'BUDGET_MANAGEMENT',
  TRANSACTION_LOOKUP: 'TRANSACTION_LOOKUP',
  LOG_TRANSACTION: 'LOG_TRANSACTION',
  DELETE_TRANSACTION: 'DELETE_TRANSACTION',
  FINANCIAL_HEALTH: 'FINANCIAL_HEALTH',
  ANOMALY_CHECK: 'ANOMALY_CHECK',
  PAYMENT_AUTHORIZATION: 'PAYMENT_AUTHORIZATION',
  GREETING: 'GREETING',
  GENERAL_QUESTION: 'GENERAL_QUESTION',
  UNKNOWN: 'UNKNOWN',
} as const;
export type Intent = (typeof Intent)[keyof typeof Intent];

/** Tools the orchestrator can expose to an agent. Every one is permission gated. */
export const ToolName = {
  GET_USER_FINANCIAL_SNAPSHOT: 'get_user_financial_snapshot',
  GET_RECENT_TRANSACTIONS: 'get_recent_transactions',
  GET_BUDGET_STATUS: 'get_budget_status',
  EVALUATE_PURCHASE: 'evaluate_purchase',
  CALCULATE_FINANCIAL_HEALTH: 'calculate_financial_health',
  GET_MONTHLY_REPORT: 'get_monthly_report',
  GET_SAVINGS_OPPORTUNITIES: 'get_savings_opportunities',
  GET_INVESTMENT_PROFILE: 'get_investment_profile',
  SEARCH_AVAILABLE_FINANCIAL_PRODUCTS: 'search_available_financial_products',
  DETECT_SPENDING_ANOMALIES: 'detect_spending_anomalies',
  CREATE_SAVINGS_GOAL: 'create_savings_goal',
  REQUEST_PAYMENT_AUTHORIZATION: 'request_payment_authorization',
  LOG_TRANSACTION: 'log_transaction',
  DELETE_TRANSACTION: 'delete_transaction',
} as const;
export type ToolName = (typeof ToolName)[keyof typeof ToolName];
export const ALL_TOOLS = valuesOf(ToolName);

export const ConversationChannel = {
  WHATSAPP: 'WHATSAPP',
  WEB: 'WEB',
  VOICE: 'VOICE',
  API: 'API',
  SYSTEM: 'SYSTEM',
} as const;
export type ConversationChannel =
  (typeof ConversationChannel)[keyof typeof ConversationChannel];

export const MessageRole = {
  USER: 'USER',
  ASSISTANT: 'ASSISTANT',
  SYSTEM: 'SYSTEM',
  TOOL: 'TOOL',
} as const;
export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

export const AgentOutputFormat = {
  CONVERSATIONAL: 'CONVERSATIONAL',
  STRUCTURED_JSON: 'STRUCTURED_JSON',
  BULLET_SUMMARY: 'BULLET_SUMMARY',
  WHATSAPP_CARD: 'WHATSAPP_CARD',
} as const;
export type AgentOutputFormat = (typeof AgentOutputFormat)[keyof typeof AgentOutputFormat];

// ------------------------------------------------------------------ payments --

export const PaymentStatus = {
  REQUIRES_CONFIRMATION: 'REQUIRES_CONFIRMATION',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

// ------------------------------------------------------------- notifications --

export const NotificationType = {
  BUDGET_ALERT: 'BUDGET_ALERT',
  PURCHASE_DECISION: 'PURCHASE_DECISION',
  MONTHLY_REPORT_READY: 'MONTHLY_REPORT_READY',
  ANOMALY_DETECTED: 'ANOMALY_DETECTED',
  SAVINGS_MILESTONE: 'SAVINGS_MILESTONE',
  IDLE_CASH_DETECTED: 'IDLE_CASH_DETECTED',
  PAYMENT_STATUS: 'PAYMENT_STATUS',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationChannel = {
  IN_APP: 'IN_APP',
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
} as const;
export type NotificationChannel =
  (typeof NotificationChannel)[keyof typeof NotificationChannel];

// ------------------------------------------------------------------- reports --

export const ReportStatus = {
  PENDING: 'PENDING',
  GENERATING: 'GENERATING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const VoiceInteractionStatus = {
  RECEIVED: 'RECEIVED',
  TRANSCRIBING: 'TRANSCRIBING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type VoiceInteractionStatus =
  (typeof VoiceInteractionStatus)[keyof typeof VoiceInteractionStatus];

export const VoiceInteractionKind = {
  VOICE_NOTE: 'VOICE_NOTE',
  CALL: 'CALL',
} as const;
export type VoiceInteractionKind =
  (typeof VoiceInteractionKind)[keyof typeof VoiceInteractionKind];

export const AuditAction = {
  USER_REGISTERED: 'USER_REGISTERED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',
  PURCHASE_ANALYSIS: 'PURCHASE_ANALYSIS',
  TRANSACTION_LOGGED: 'TRANSACTION_LOGGED',
  TRANSACTION_DELETED: 'TRANSACTION_DELETED',
  BUDGET_UPDATED: 'BUDGET_UPDATED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  AI_CONVERSATION_TURN: 'AI_CONVERSATION_TURN',
  PAYMENT_INTENT_CREATED: 'PAYMENT_INTENT_CREATED',
  PAYMENT_AUTHORIZED: 'PAYMENT_AUTHORIZED',
  PAYMENT_EXECUTED: 'PAYMENT_EXECUTED',
  AGENT_CREATED: 'AGENT_CREATED',
  AGENT_UPDATED: 'AGENT_UPDATED',
  AGENT_DELETED: 'AGENT_DELETED',
  ROLE_CREATED: 'ROLE_CREATED',
  ROLE_UPDATED: 'ROLE_UPDATED',
  ROLE_ASSIGNED: 'ROLE_ASSIGNED',
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  REPORT_GENERATED: 'REPORT_GENERATED',
  WEBHOOK_RECEIVED: 'WEBHOOK_RECEIVED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
