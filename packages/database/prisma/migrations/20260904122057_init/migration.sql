-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'CLOSED');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('SAVINGS', 'CURRENT', 'CREDIT_CARD', 'LOAN', 'FIXED_DEPOSIT', 'WALLET');

-- CreateEnum
CREATE TYPE "BankAccountStatus" AS ENUM ('ACTIVE', 'DORMANT', 'CLOSED');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'ESSENTIAL', 'DISCRETIONARY', 'SAVINGS', 'INVESTMENT', 'DEBT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "BudgetStrategy" AS ENUM ('BALANCED', 'AGGRESSIVE_SAVINGS', 'DEBT_REDUCTION', 'GROWTH_MODE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BudgetRuleType" AS ENUM ('CATEGORY_MAX', 'CATEGORY_MIN', 'SAVINGS_MIN', 'TOTAL_SPEND_MAX');

-- CreateEnum
CREATE TYPE "SavingsGoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseVerdict" AS ENUM ('SMART_BUY', 'AFFORDABLE_BUT_CAUTION', 'WAIT_AND_SAVE', 'NOT_RECOMMENDED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskTolerance" AS ENUM ('CONSERVATIVE', 'MODERATE', 'AGGRESSIVE');

-- CreateEnum
CREATE TYPE "InvestmentHorizon" AS ENUM ('SHORT', 'MEDIUM', 'LONG');

-- CreateEnum
CREATE TYPE "FinancialProductType" AS ENUM ('SAVINGS_ACCOUNT', 'FIXED_DEPOSIT', 'RECURRING_DEPOSIT', 'LIQUID_FUND', 'DEBT_FUND', 'INDEX_FUND', 'EQUITY_FUND', 'GOLD', 'PPF', 'NPS', 'INSURANCE', 'CREDIT_CARD', 'LOAN');

-- CreateEnum
CREATE TYPE "LiquidityLevel" AS ENUM ('INSTANT', 'HIGH', 'MEDIUM', 'LOW', 'LOCKED');

-- CreateEnum
CREATE TYPE "AllocationBucket" AS ENUM ('EMERGENCY_FUND', 'LIQUID_RESERVE', 'LOW_RISK', 'LONG_TERM_GROWTH', 'DEBT_REPAYMENT', 'GOAL_FUNDING');

-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('WHATSAPP', 'WEB', 'VOICE', 'API', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "AgentOutputFormat" AS ENUM ('CONVERSATIONAL', 'STRUCTURED_JSON', 'BULLET_SUMMARY', 'WHATSAPP_CARD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REQUIRES_CONFIRMATION', 'PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BUDGET_ALERT', 'PURCHASE_DECISION', 'MONTHLY_REPORT_READY', 'ANOMALY_DETECTED', 'SAVINGS_MILESTONE', 'IDLE_CASH_DETECTED', 'PAYMENT_STATUS', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "VoiceInteractionStatus" AS ENUM ('RECEIVED', 'TRANSCRIBING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "VoiceInteractionKind" AS ENUM ('VOICE_NOTE', 'CALL');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "occupation" TEXT,
    "employmentType" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "locale" TEXT NOT NULL DEFAULT 'en-IN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "declaredMonthlyIncome" DECIMAL(18,2),
    "incomeDayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "dependents" INTEGER NOT NULL DEFAULT 0,
    "emergencyFundTargetMonths" DECIMAL(5,2) NOT NULL DEFAULT 6,
    "emergencyReserveAmount" DECIMAL(18,2),
    "monthlyDebtPayments" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDebtOutstanding" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
    "voiceRepliesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" UUID,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "group" TEXT NOT NULL DEFAULT 'General',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "assignedBy" UUID,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banks" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "logoUrl" TEXT,
    "providerKey" TEXT NOT NULL DEFAULT 'mock',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bankId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "maskedNumber" TEXT NOT NULL,
    "nickname" TEXT,
    "type" "BankAccountType" NOT NULL,
    "status" "BankAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "currentBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "availableBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(18,2),
    "isLiability" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isEmergencyFund" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_balances" (
    "id" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL,
    "available" DECIMAL(18,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_categories" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'CircleDashed',
    "colour" TEXT NOT NULL DEFAULT '#64748b',
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "defaultCategoryId" UUID,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "merchantId" UUID,
    "externalId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'POSTED',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3),
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "paymentIntentId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_obligations" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "categoryKind" "CategoryKind" NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "strategy" "BudgetStrategy" NOT NULL,
    "month" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "monthlyIncome" DECIMAL(18,2) NOT NULL,
    "needsPercent" DECIMAL(5,2) NOT NULL,
    "wantsPercent" DECIMAL(5,2) NOT NULL,
    "savingsPercent" DECIMAL(5,2) NOT NULL,
    "investmentsPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "debtPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_categories" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "allocated" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_rules" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "type" "BudgetRuleType" NOT NULL,
    "categoryKey" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_goals" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DECIMAL(18,2) NOT NULL,
    "currentAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "monthlyContribution" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "targetDate" TIMESTAMP(3),
    "categoryKey" TEXT,
    "status" "SavingsGoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_snapshots" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "totalBalance" DECIMAL(18,2) NOT NULL,
    "availableBalance" DECIMAL(18,2) NOT NULL,
    "netWorth" DECIMAL(18,2) NOT NULL,
    "monthlyIncome" DECIMAL(18,2) NOT NULL,
    "totalSpentThisPeriod" DECIMAL(18,2) NOT NULL,
    "essentialExpensesRemaining" DECIMAL(18,2) NOT NULL,
    "discretionaryBudgetRemaining" DECIMAL(18,2) NOT NULL,
    "savingsTarget" DECIMAL(18,2) NOT NULL,
    "savingsProgress" DECIMAL(18,2) NOT NULL,
    "emergencyFundMonths" DECIMAL(6,2) NOT NULL,
    "safelySpendableCash" DECIMAL(18,2) NOT NULL,
    "projectedSavingsRatePercent" DECIMAL(6,2) NOT NULL,
    "payload" JSONB NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_health_scores" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "snapshotId" UUID,
    "score" DECIMAL(5,2) NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "month" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_health_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_decisions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "snapshotId" UUID,
    "conversationId" UUID,
    "description" TEXT NOT NULL,
    "merchant" TEXT,
    "categoryKey" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "monthlyCost" DECIMAL(18,2),
    "importance" INTEGER NOT NULL DEFAULT 3,
    "verdict" "PurchaseVerdict" NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "confidence" DECIMAL(5,2) NOT NULL,
    "affordabilityGap" DECIMAL(18,2) NOT NULL,
    "budgetImpactPercentage" DECIMAL(10,2) NOT NULL,
    "primaryReasons" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "explanation" TEXT,
    "channel" "ConversationChannel" NOT NULL DEFAULT 'WEB',
    "wasPurchased" BOOLEAN NOT NULL DEFAULT false,
    "engineVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_decision_factors" (
    "id" UUID NOT NULL,
    "decisionId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,
    "weight" DECIMAL(5,4) NOT NULL,
    "contribution" DECIMAL(6,2) NOT NULL,
    "detail" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_decision_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "riskTolerance" "RiskTolerance" NOT NULL DEFAULT 'MODERATE',
    "horizon" "InvestmentHorizon" NOT NULL DEFAULT 'MEDIUM',
    "monthlyInvestmentCapacity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "hasEmergencyFund" BOOLEAN NOT NULL DEFAULT false,
    "liquidityNeedsMonths" DECIMAL(5,2) NOT NULL DEFAULT 6,
    "experienceLevel" TEXT NOT NULL DEFAULT 'BEGINNER',
    "goals" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_recommendations" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "surplusCash" DECIMAL(18,2) NOT NULL,
    "allocations" JSONB NOT NULL,
    "disclaimer" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Primary Portfolio',
    "totalValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holdings" (
    "id" UUID NOT NULL,
    "portfolioId" UUID NOT NULL,
    "productId" UUID,
    "name" TEXT NOT NULL,
    "type" "FinancialProductType" NOT NULL,
    "units" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "investedAmount" DECIMAL(18,2) NOT NULL,
    "currentValue" DECIMAL(18,2) NOT NULL,
    "bucket" "AllocationBucket",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_products" (
    "id" UUID NOT NULL,
    "bankId" UUID,
    "name" TEXT NOT NULL,
    "type" "FinancialProductType" NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "liquidity" "LiquidityLevel" NOT NULL,
    "minimumInvestment" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "interestRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "expectedReturnLow" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "expectedReturnHigh" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "lockInMonths" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "bucket" "AllocationBucket",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_product_rates" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "rate" DECIMAL(6,3) NOT NULL,
    "minAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "maxAmount" DECIMAL(18,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_product_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_reports" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "data" JSONB NOT NULL,
    "narrative" TEXT,
    "pdfUrl" TEXT,
    "generatedAt" TIMESTAMP(3),
    "engineVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agents" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "systemInstructions" TEXT NOT NULL,
    "outputFormat" "AgentOutputFormat" NOT NULL DEFAULT 'CONVERSATIONAL',
    "handledIntents" JSONB NOT NULL DEFAULT '[]',
    "requiredPermissions" JSONB NOT NULL DEFAULT '[]',
    "temperature" DECIMAL(3,2) NOT NULL DEFAULT 0.3,
    "maxTokens" INTEGER NOT NULL DEFAULT 900,
    "model" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "restrictedToRoleId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tool_permissions" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "toolName" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "constraints" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_tool_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_configurations" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "changedBy" UUID,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agent_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "agentId" UUID,
    "channel" "ConversationChannel" NOT NULL,
    "title" TEXT,
    "externalRef" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "agentId" UUID,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "intent" TEXT,
    "intentConfidence" DECIMAL(5,2),
    "toolCalls" JSONB,
    "structured" JSONB,
    "snapshotId" UUID,
    "model" TEXT,
    "usedLLM" BOOLEAN NOT NULL DEFAULT false,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_interactions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "conversationId" UUID,
    "kind" "VoiceInteractionKind" NOT NULL DEFAULT 'VOICE_NOTE',
    "status" "VoiceInteractionStatus" NOT NULL DEFAULT 'RECEIVED',
    "channel" "ConversationChannel" NOT NULL DEFAULT 'WHATSAPP',
    "externalMediaId" TEXT,
    "audioUrl" TEXT,
    "durationSeconds" INTEGER,
    "transcript" TEXT,
    "transcriptConfidence" DECIMAL(5,2),
    "responseText" TEXT,
    "responseAudioUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "purchaseDecisionId" UUID,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "merchant" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "categoryKey" TEXT NOT NULL DEFAULT 'shopping',
    "status" "PaymentStatus" NOT NULL DEFAULT 'REQUIRES_CONFIRMATION',
    "confirmationPhrase" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL DEFAULT 'mock',
    "providerRef" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "authorizedVia" "ConversationChannel",
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "subjectId" UUID,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'API',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_revokedAt_idx" ON "refresh_tokens"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_group_idx" ON "permissions"("group");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "user_roles"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "banks_code_key" ON "banks"("code");

-- CreateIndex
CREATE INDEX "bank_accounts_userId_status_idx" ON "bank_accounts"("userId", "status");

-- CreateIndex
CREATE INDEX "bank_accounts_userId_isPrimary_idx" ON "bank_accounts"("userId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_bankId_externalId_key" ON "bank_accounts"("bankId", "externalId");

-- CreateIndex
CREATE INDEX "account_balances_bankAccountId_recordedAt_idx" ON "account_balances"("bankAccountId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "account_balances_bankAccountId_recordedAt_key" ON "account_balances"("bankAccountId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_categories_key_key" ON "transaction_categories"("key");

-- CreateIndex
CREATE INDEX "transaction_categories_kind_idx" ON "transaction_categories"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_name_key" ON "merchants"("name");

-- CreateIndex
CREATE INDEX "transactions_userId_occurredAt_idx" ON "transactions"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "transactions_bankAccountId_occurredAt_idx" ON "transactions"("bankAccountId", "occurredAt");

-- CreateIndex
CREATE INDEX "transactions_categoryId_occurredAt_idx" ON "transactions"("categoryId", "occurredAt");

-- CreateIndex
CREATE INDEX "transactions_userId_direction_occurredAt_idx" ON "transactions"("userId", "direction", "occurredAt");

-- CreateIndex
CREATE INDEX "transactions_merchantId_idx" ON "transactions"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_bankAccountId_externalId_key" ON "transactions"("bankAccountId", "externalId");

-- CreateIndex
CREATE INDEX "recurring_obligations_userId_isActive_idx" ON "recurring_obligations"("userId", "isActive");

-- CreateIndex
CREATE INDEX "budgets_userId_isActive_idx" ON "budgets"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_userId_month_key" ON "budgets"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "budget_categories_budgetId_categoryId_key" ON "budget_categories"("budgetId", "categoryId");

-- CreateIndex
CREATE INDEX "budget_rules_budgetId_isActive_idx" ON "budget_rules"("budgetId", "isActive");

-- CreateIndex
CREATE INDEX "savings_goals_userId_status_idx" ON "savings_goals"("userId", "status");

-- CreateIndex
CREATE INDEX "financial_snapshots_userId_asOf_idx" ON "financial_snapshots"("userId", "asOf");

-- CreateIndex
CREATE INDEX "financial_health_scores_userId_createdAt_idx" ON "financial_health_scores"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "financial_health_scores_userId_month_idx" ON "financial_health_scores"("userId", "month");

-- CreateIndex
CREATE INDEX "purchase_decisions_userId_createdAt_idx" ON "purchase_decisions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "purchase_decisions_userId_verdict_idx" ON "purchase_decisions"("userId", "verdict");

-- CreateIndex
CREATE INDEX "purchase_decisions_verdict_createdAt_idx" ON "purchase_decisions"("verdict", "createdAt");

-- CreateIndex
CREATE INDEX "purchase_decision_factors_decisionId_idx" ON "purchase_decision_factors"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "investment_profiles_userId_key" ON "investment_profiles"("userId");

-- CreateIndex
CREATE INDEX "investment_recommendations_userId_createdAt_idx" ON "investment_recommendations"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "portfolios_userId_key" ON "portfolios"("userId");

-- CreateIndex
CREATE INDEX "holdings_portfolioId_idx" ON "holdings"("portfolioId");

-- CreateIndex
CREATE INDEX "financial_products_type_isActive_idx" ON "financial_products"("type", "isActive");

-- CreateIndex
CREATE INDEX "financial_products_bucket_isActive_idx" ON "financial_products"("bucket", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "financial_product_rates_productId_tenureMonths_effectiveFro_key" ON "financial_product_rates"("productId", "tenureMonths", "effectiveFrom");

-- CreateIndex
CREATE INDEX "monthly_reports_userId_month_idx" ON "monthly_reports"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_reports_userId_month_key" ON "monthly_reports"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agents_key_key" ON "ai_agents"("key");

-- CreateIndex
CREATE INDEX "ai_agents_isEnabled_priority_idx" ON "ai_agents"("isEnabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "agent_tool_permissions_agentId_toolName_key" ON "agent_tool_permissions"("agentId", "toolName");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_configurations_agentId_version_key" ON "ai_agent_configurations"("agentId", "version");

-- CreateIndex
CREATE INDEX "ai_conversations_userId_channel_createdAt_idx" ON "ai_conversations"("userId", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "ai_conversations_externalRef_idx" ON "ai_conversations"("externalRef");

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_createdAt_idx" ON "ai_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "voice_interactions_userId_createdAt_idx" ON "voice_interactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "voice_interactions_status_idx" ON "voice_interactions"("status");

-- CreateIndex
CREATE INDEX "payment_intents_userId_status_idx" ON "payment_intents"("userId", "status");

-- CreateIndex
CREATE INDEX "payment_intents_status_expiresAt_idx" ON "payment_intents"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_resourceId_idx" ON "audit_logs"("resourceId");

-- CreateIndex
CREATE INDEX "webhook_events_status_createdAt_idx" ON "webhook_events"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_externalId_key" ON "webhook_events"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "transaction_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "transaction_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_obligations" ADD CONSTRAINT "recurring_obligations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "transaction_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_rules" ADD CONSTRAINT "budget_rules_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_snapshots" ADD CONSTRAINT "financial_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_health_scores" ADD CONSTRAINT "financial_health_scores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_health_scores" ADD CONSTRAINT "financial_health_scores_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "financial_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_decisions" ADD CONSTRAINT "purchase_decisions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_decisions" ADD CONSTRAINT "purchase_decisions_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "financial_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_decision_factors" ADD CONSTRAINT "purchase_decision_factors_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "purchase_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_profiles" ADD CONSTRAINT "investment_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_recommendations" ADD CONSTRAINT "investment_recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "financial_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_products" ADD CONSTRAINT "financial_products_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_product_rates" ADD CONSTRAINT "financial_product_rates_productId_fkey" FOREIGN KEY ("productId") REFERENCES "financial_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_restrictedToRoleId_fkey" FOREIGN KEY ("restrictedToRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tool_permissions" ADD CONSTRAINT "agent_tool_permissions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_configurations" ADD CONSTRAINT "ai_agent_configurations_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_interactions" ADD CONSTRAINT "voice_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_interactions" ADD CONSTRAINT "voice_interactions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_purchaseDecisionId_fkey" FOREIGN KEY ("purchaseDecisionId") REFERENCES "purchase_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
