import { prisma, toNullableNumber, toNumber } from '@flowmoney/database';
import {
  DEFAULT_CURRENCY,
  categoryKind,
  type EngineBudget,
  type EngineContext,
  type EngineTransaction,
} from '@flowmoney/shared-types';
import { monthKeyOf } from '@flowmoney/financial-engine';

/**
 * The worker's copy of the API's context loader (`apps/api/src/services/engine-context.ts`).
 * Kept identical in shape deliberately: both sides feed the same pure engine
 * and must agree on what an "as of" position means. Not shared as a package
 * because it is the only piece of app-local wiring the worker needs — pulling
 * in the API app itself would couple two independently deployable services.
 */
const HISTORY_MONTHS = 6;

function historyStart(asOf: Date): Date {
  return new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (HISTORY_MONTHS - 1), 1));
}

export async function loadEngineContext(userId: string, asOf: Date = new Date()): Promise<EngineContext> {
  const month = monthKeyOf(asOf);

  const [user, accounts, transactions, budget, obligations, goals, portfolio] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
    prisma.bankAccount.findMany({
      where: { userId, status: { not: 'CLOSED' } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: { gte: historyStart(asOf), lte: asOf },
        status: { in: ['POSTED', 'PENDING'] },
      },
      include: { category: true, merchant: true },
      orderBy: { occurredAt: 'asc' },
    }),
    prisma.budget.findFirst({
      where: { userId, month, isActive: true },
      include: { categories: { include: { category: true } }, rules: { where: { isActive: true } } },
    }),
    prisma.recurringObligation.findMany({ where: { userId, isActive: true } }),
    prisma.savingsGoal.findMany({ where: { userId, status: 'ACTIVE' } }),
    prisma.portfolio.findUnique({ where: { userId }, include: { holdings: true } }),
  ]);

  if (!user) throw new Error(`User ${userId} not found`);
  const profile = user.profile;

  const engineBudget: EngineBudget | null = budget
    ? {
        id: budget.id,
        strategy: budget.strategy,
        periodStart: budget.periodStart.toISOString(),
        periodEnd: budget.periodEnd.toISOString(),
        monthlyIncome: toNumber(budget.monthlyIncome),
        needsPercent: toNumber(budget.needsPercent),
        wantsPercent: toNumber(budget.wantsPercent),
        savingsPercent: toNumber(budget.savingsPercent),
        investmentsPercent: toNumber(budget.investmentsPercent),
        debtPercent: toNumber(budget.debtPercent),
        allocations: budget.categories.map((row) => ({
          categoryKey: row.category.key,
          categoryKind: row.category.kind,
          allocated: toNumber(row.allocated),
        })),
        rules: budget.rules.map((rule) => ({
          type: rule.type,
          categoryKey: rule.categoryKey,
          amount: toNumber(rule.amount),
          label: rule.label,
        })),
      }
    : null;

  const engineTransactions: EngineTransaction[] = transactions.map((txn) => ({
    id: txn.id,
    amount: toNumber(txn.amount),
    direction: txn.direction,
    occurredAt: txn.occurredAt.toISOString(),
    categoryKey: txn.category.key,
    categoryKind: txn.category.kind,
    merchantName: txn.merchant?.displayName ?? null,
    description: txn.description,
    isRecurring: txn.isRecurring,
    isPending: txn.status === 'PENDING',
  }));

  const portfolioValue = portfolio
    ? portfolio.holdings.reduce((sum, holding) => sum + toNumber(holding.currentValue), 0)
    : 0;

  return {
    userId,
    asOf: asOf.toISOString(),
    currency: profile?.currency ?? DEFAULT_CURRENCY,
    accounts: accounts.map((account) => ({
      id: account.id,
      type: account.type,
      balance: toNumber(account.currentBalance),
      availableBalance: toNumber(account.availableBalance),
      isLiability: account.isLiability,
      isEmergencyFund: account.isEmergencyFund,
      currency: account.currency,
    })),
    transactions: engineTransactions,
    budget: engineBudget,
    recurringObligations: obligations.map((obligation) => ({
      label: obligation.label,
      amount: toNumber(obligation.amount),
      dueDay: obligation.dueDay,
      categoryKey: obligation.categoryKey,
      categoryKind: obligation.categoryKind ?? categoryKind(obligation.categoryKey),
    })),
    emergencyFundTargetMonths: toNumber(profile?.emergencyFundTargetMonths, 6),
    emergencyReserveAmount: toNullableNumber(profile?.emergencyReserveAmount),
    monthlyDebtPayments: toNumber(profile?.monthlyDebtPayments),
    totalDebtOutstanding: toNumber(profile?.totalDebtOutstanding),
    declaredMonthlyIncome: toNullableNumber(profile?.declaredMonthlyIncome),
    savingsGoals: goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetAmount: toNumber(goal.targetAmount),
      currentAmount: toNumber(goal.currentAmount),
      targetDate: goal.targetDate ? goal.targetDate.toISOString() : null,
      monthlyContribution: toNumber(goal.monthlyContribution),
    })),
    investmentContributionsThisMonth: 0,
    portfolioValue,
  };
}
