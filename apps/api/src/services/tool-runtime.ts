import { prisma, toDecimal, toNumber } from '@flowmoney/database';
import type {
  FinancialProductView,
  InvestmentProfileView,
  PaymentAuthorizationRequest,
  PaymentAuthorizationView,
  SavingsGoalView,
  ToolRuntime,
  TransactionSummaryRow,
} from '@flowmoney/ai-agents';
import { detectSpendingAnomalies, findSavingsOpportunities } from '@flowmoney/financial-engine';
import { analyseIdleCash } from '@flowmoney/financial-engine';
import {
  budgetStatusOf,
  computeHealth,
  getFinancialView,
  invalidateFinancialCache,
} from './financial.service';
import { buildRecommendation } from './investment.service';
import { getInvestmentProfile, searchProducts } from './investment.service';
import { createPaymentIntent } from './payment.service';
import { analyzePurchase } from './purchase.service';
import { generateMonthlyReport } from './report.service';

/**
 * The concrete capability surface handed to the agent orchestrator.
 *
 * Everything an AI agent can reach passes through here. Note what is absent:
 * no arbitrary queries, no access to other users, and no method that completes
 * a payment — only one that prepares an intent for the user to authorise.
 */
export const toolRuntime: ToolRuntime = {
  async getFinancialSnapshot(userId) {
    const view = await getFinancialView(userId);
    return view.snapshot;
  },

  async getRecentTransactions(userId, options) {
    const days = options.days ?? 30;
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: { gte: since },
        ...(options.categoryKey ? { category: { key: options.categoryKey } } : {}),
      },
      include: { category: true, merchant: true },
      orderBy: { occurredAt: 'desc' },
      take: options.limit ?? 20,
    });

    return rows.map<TransactionSummaryRow>((txn) => ({
      id: txn.id,
      amount: toNumber(txn.amount),
      direction: txn.direction,
      description: txn.description,
      merchant: txn.merchant?.displayName ?? null,
      categoryKey: txn.category.key,
      occurredAt: txn.occurredAt.toISOString(),
    }));
  },

  async getBudgetStatus(userId) {
    return budgetStatusOf(await getFinancialView(userId));
  },

  async evaluatePurchase(userId, request, options) {
    const result = await analyzePurchase({
      userId,
      request,
      persist: options.persist,
      channel: options.channel,
      conversationId: options.conversationId,
    });
    return { decision: result.decision, decisionId: result.decisionId };
  },

  async calculateFinancialHealth(userId) {
    return computeHealth(await getFinancialView(userId));
  },

  async getMonthlyReport(userId, month) {
    return generateMonthlyReport(userId, month);
  },

  async getSavingsOpportunities(userId) {
    const view = await getFinancialView(userId);
    const idleCash = analyseIdleCash(view.snapshot, view.internals);
    const opportunities = findSavingsOpportunities(view.ctx, view.snapshot, view.internals);
    const { allocation } = idleCash.hasSurplus
      ? await buildRecommendation(userId)
      : { allocation: null };
    return { idleCash, opportunities, allocation };
  },

  async getInvestmentProfile(userId): Promise<InvestmentProfileView> {
    const profile = await getInvestmentProfile(userId);
    return {
      riskTolerance: profile.riskTolerance,
      horizon: profile.horizon,
      monthlyInvestmentCapacity: profile.monthlyInvestmentCapacity,
      hasEmergencyFund: profile.hasEmergencyFund,
      liquidityNeedsMonths: profile.liquidityNeedsMonths,
      experienceLevel: profile.experienceLevel,
      goals: profile.goals,
      portfolioValue: profile.portfolioValue,
      holdings: profile.holdings.map((holding) => ({
        name: holding.name,
        type: holding.type,
        investedAmount: holding.investedAmount,
        currentValue: holding.currentValue,
      })),
    };
  },

  async searchFinancialProducts(query): Promise<FinancialProductView[]> {
    const products = await searchProducts(query);
    return products.map((product) => ({
      id: product.id,
      name: product.name,
      type: product.type,
      riskLevel: product.riskLevel,
      liquidity: product.liquidity,
      minimumInvestment: product.minimumInvestment,
      interestRate: product.interestRate,
      expectedReturnLow: product.expectedReturnLow,
      expectedReturnHigh: product.expectedReturnHigh,
      lockInMonths: product.lockInMonths,
      description: product.description,
      bucket: product.bucket,
    }));
  },

  async detectSpendingAnomalies(userId) {
    const view = await getFinancialView(userId);
    return detectSpendingAnomalies(view.ctx, view.snapshot, view.internals);
  },

  async createSavingsGoal(userId, input): Promise<SavingsGoalView> {
    const monthlyContribution = input.monthlyContribution ?? 0;
    const goal = await prisma.savingsGoal.create({
      data: {
        userId,
        name: input.name,
        targetAmount: toDecimal(input.targetAmount),
        currentAmount: toDecimal(0),
        monthlyContribution: toDecimal(monthlyContribution),
        status: 'ACTIVE',
      },
    });
    await invalidateFinancialCache(userId);
    return {
      id: goal.id,
      name: goal.name,
      targetAmount: toNumber(goal.targetAmount),
      currentAmount: toNumber(goal.currentAmount),
      monthlyContribution: toNumber(goal.monthlyContribution),
      monthsToTarget:
        monthlyContribution > 0 ? Math.ceil(input.targetAmount / monthlyContribution) : null,
    };
  },

  async requestPaymentAuthorization(
    userId,
    input: PaymentAuthorizationRequest,
  ): Promise<PaymentAuthorizationView> {
    const intent = await createPaymentIntent({
      userId,
      amount: input.amount,
      merchant: input.merchant,
      description: input.description,
      categoryKey: input.categoryKey,
      accountId: input.accountId,
      purchaseDecisionId: input.purchaseDecisionId ?? null,
    });
    return {
      paymentIntentId: intent.paymentIntentId,
      amount: intent.amount,
      merchant: intent.merchant,
      accountMasked: intent.accountMasked,
      confirmationPhrase: intent.confirmationPhrase,
      expiresAt: intent.expiresAt,
      status: intent.status,
      requiresExplicitUserConfirmation: true,
    };
  },
};
