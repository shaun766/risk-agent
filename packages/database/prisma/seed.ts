/**
 * FlowMoney AI demo seed.
 *
 * Creates the full platform: RBAC, the category taxonomy, banks, merchants, a
 * product catalogue, the default AI agent roster, five staff accounts and ten
 * customers with six months of statement-like history.
 *
 * Every derived artefact — financial snapshots, health scores, purchase
 * decisions — is produced by running the real financial engine over the seeded
 * data, so nothing in the demo is a hand-written fake.
 *
 *   pnpm db:seed
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '../../../.env') });

import {
  ALL_PERMISSIONS,
  CATEGORIES,
  DEFAULT_AGENTS,
  DEFAULT_ROLES,
  ENGINE_VERSION,
  PERMISSION_GROUPS,
  type EngineContext,
  type PurchaseRequest,
  categoryKind,
  presetFor,
} from '@flowmoney/shared-types';
import {
  buildSnapshot,
  computeFinancialHealth,
  deriveAllocations,
  evaluatePurchase,
  monthKeyOf,
} from '@flowmoney/financial-engine';
import { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/password';
import { toDecimal, toRateDecimal } from '../src/decimal';
import { BANKS, MERCHANTS, PRODUCTS } from './seed/catalogue';
import { buildBalanceHistory, generateTransactions } from './seed/generator';
import { PERSONAS, STAFF, type Persona } from './seed/personas';
import { createRng } from './seed/rng';

const prisma = new PrismaClient();
const NOW = new Date();
const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Password123!';

function humanise(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function groupOf(permission: string): string {
  for (const [group, members] of Object.entries(PERMISSION_GROUPS)) {
    if ((members as string[]).includes(permission)) return group;
  }
  return 'General';
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

// ---------------------------------------------------------------- wipe ----

async function reset() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error('Refusing to seed a production database. Set ALLOW_PRODUCTION_SEED=true to override.');
  }
  // Order matters: children before parents. Cascades cover most of it, but
  // being explicit keeps re-seeding predictable.
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.voiceInteraction.deleteMany(),
    prisma.aIMessage.deleteMany(),
    prisma.aIConversation.deleteMany(),
    prisma.aIAgentConfiguration.deleteMany(),
    prisma.agentToolPermission.deleteMany(),
    prisma.aIAgent.deleteMany(),
    prisma.purchaseDecisionFactor.deleteMany(),
    prisma.paymentIntent.deleteMany(),
    prisma.purchaseDecision.deleteMany(),
    prisma.financialHealthScore.deleteMany(),
    prisma.financialSnapshot.deleteMany(),
    prisma.monthlyReport.deleteMany(),
    prisma.investmentRecommendation.deleteMany(),
    prisma.holding.deleteMany(),
    prisma.portfolio.deleteMany(),
    prisma.investmentProfile.deleteMany(),
    prisma.savingsGoal.deleteMany(),
    prisma.budgetRule.deleteMany(),
    prisma.budgetCategory.deleteMany(),
    prisma.budget.deleteMany(),
    prisma.recurringObligation.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.accountBalance.deleteMany(),
    prisma.bankAccount.deleteMany(),
    prisma.merchant.deleteMany(),
    prisma.transactionCategory.deleteMany(),
    prisma.financialProductRate.deleteMany(),
    prisma.financialProduct.deleteMany(),
    prisma.bank.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.role.deleteMany(),
    prisma.userProfile.deleteMany(),
    prisma.user.deleteMany(),
    prisma.systemSetting.deleteMany(),
  ]);
}

// ---------------------------------------------------------------- RBAC ----

async function seedRbac() {
  await prisma.permission.createMany({
    data: ALL_PERMISSIONS.map((key) => ({
      key,
      name: humanise(key),
      group: groupOf(key),
      description: `Allows the holder to ${humanise(key).toLowerCase()}.`,
    })),
  });
  const permissions = await prisma.permission.findMany();
  const permissionByKey = new Map(permissions.map((p) => [p.key, p.id]));

  for (const role of DEFAULT_ROLES) {
    const created = await prisma.role.create({
      data: {
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.key !== 'PREMIUM_WEALTH_ADVISOR',
      },
    });
    await prisma.rolePermission.createMany({
      data: role.permissions
        .map((permission) => permissionByKey.get(permission))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: created.id, permissionId })),
      skipDuplicates: true,
    });
  }

  const roles = await prisma.role.findMany();
  return new Map(roles.map((r) => [r.key, r.id]));
}

// ----------------------------------------------------------- catalogue ----

async function seedCatalogue() {
  await prisma.transactionCategory.createMany({
    data: CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      kind: c.kind,
      icon: c.icon,
      colour: c.colour,
      isSystem: true,
    })),
  });
  const categories = await prisma.transactionCategory.findMany();
  const categoryByKey = new Map(categories.map((c) => [c.key, c.id]));

  await prisma.bank.createMany({ data: BANKS });
  const banks = await prisma.bank.findMany();
  const bankByCode = new Map(banks.map((b) => [b.code, b.id]));

  const merchantRows: Array<{ name: string; displayName: string; defaultCategoryId: string | null }> = [];
  for (const [categoryKey, names] of Object.entries(MERCHANTS)) {
    for (const name of names) {
      merchantRows.push({
        name,
        displayName: name,
        defaultCategoryId: categoryByKey.get(categoryKey) ?? null,
      });
    }
  }
  await prisma.merchant.createMany({ data: merchantRows, skipDuplicates: true });
  const merchants = await prisma.merchant.findMany();
  const merchantByName = new Map(merchants.map((m) => [m.name, m.id]));

  const productByName = new Map<string, string>();
  for (const product of PRODUCTS) {
    const created = await prisma.financialProduct.create({
      data: {
        bankId: bankByCode.get('MRDN') ?? null,
        name: product.name,
        type: product.type,
        riskLevel: product.riskLevel,
        liquidity: product.liquidity,
        minimumInvestment: toDecimal(product.minimumInvestment),
        interestRate: toRateDecimal(product.interestRate),
        expectedReturnLow: toRateDecimal(product.expectedReturnLow),
        expectedReturnHigh: toRateDecimal(product.expectedReturnHigh),
        lockInMonths: product.lockInMonths,
        description: product.description,
        bucket: product.bucket,
        isActive: true,
      },
    });
    productByName.set(product.name, created.id);
    if (product.rates?.length) {
      await prisma.financialProductRate.createMany({
        data: product.rates.map((rate) => ({
          productId: created.id,
          tenureMonths: rate.tenureMonths,
          rate: toRateDecimal(rate.rate),
          minAmount: toDecimal(rate.minAmount),
        })),
      });
    }
  }

  return { categoryByKey, bankByCode, merchantByName, productByName };
}

// -------------------------------------------------------------- agents ----

async function seedAgents(roleByKey: Map<string, string>) {
  for (const definition of DEFAULT_AGENTS) {
    const agent = await prisma.aIAgent.create({
      data: {
        key: definition.key,
        name: definition.name,
        description: definition.description,
        systemInstructions: definition.systemInstructions,
        outputFormat: definition.outputFormat,
        handledIntents: definition.handledIntents,
        requiredPermissions: definition.requiredPermissions,
        temperature: toRateDecimal(definition.temperature, 2),
        maxTokens: definition.maxTokens,
        isEnabled: true,
        isSystem: true,
        priority: definition.priority,
      },
    });
    await prisma.agentToolPermission.createMany({
      data: definition.allowedTools.map((toolName) => ({
        agentId: agent.id,
        toolName,
        isEnabled: true,
      })),
    });
    await prisma.aIAgentConfiguration.create({
      data: {
        agentId: agent.id,
        version: 1,
        note: 'Initial system configuration',
        config: {
          systemInstructions: definition.systemInstructions,
          allowedTools: definition.allowedTools,
          handledIntents: definition.handledIntents,
          outputFormat: definition.outputFormat,
          temperature: definition.temperature,
          maxTokens: definition.maxTokens,
        } as Prisma.InputJsonValue,
      },
    });
  }

  // A bank-authored agent, demonstrating that new agents need no code change.
  const studentAgent = await prisma.aIAgent.create({
    data: {
      key: 'STUDENT_FINANCIAL_COACH',
      name: 'Student Financial Coach',
      description: 'Created by a bank administrator for the student segment.',
      systemInstructions: `You specialise in helping university students manage irregular expenses, food spending, subscriptions and limited income.

Assume the user has a small balance and little margin for error. Use small, concrete numbers. Never suggest investing before they hold at least one month of expenses in cash.

Prefer weekly framing over monthly — students think in weeks.`,
      outputFormat: 'BULLET_SUMMARY',
      handledIntents: ['BUDGET_MANAGEMENT', 'SAVINGS_OPTIMIZATION'],
      requiredPermissions: ['VIEW_OWN_BUDGET'],
      temperature: toRateDecimal(0.4, 2),
      maxTokens: 700,
      isEnabled: true,
      isSystem: false,
      priority: 15,
      restrictedToRoleId: roleByKey.get('CUSTOMER') ?? null,
    },
  });
  await prisma.agentToolPermission.createMany({
    data: ['get_budget_status', 'get_recent_transactions', 'evaluate_purchase'].map((toolName) => ({
      agentId: studentAgent.id,
      toolName,
      isEnabled: true,
    })),
  });
}

// ------------------------------------------------------------- customers --

interface SeededUser {
  userId: string;
  persona: Persona;
  ctx: EngineContext;
}

async function seedPersona(
  persona: Persona,
  index: number,
  refs: Awaited<ReturnType<typeof seedCatalogue>>,
  customerRoleId: string,
  passwordHash: string,
): Promise<SeededUser> {
  const rng = createRng(1000 + index * 37);

  const user = await prisma.user.create({
    data: {
      email: persona.email,
      passwordHash,
      fullName: persona.fullName,
      phone: persona.phone,
      status: 'ACTIVE',
      lastLoginAt: new Date(NOW.getTime() - rng.int(1, 72) * 3_600_000),
      profile: {
        create: {
          occupation: persona.occupation,
          employmentType: persona.employmentType,
          city: persona.city,
          dependents: persona.dependents,
          declaredMonthlyIncome: toDecimal(persona.income),
          incomeDayOfMonth: persona.incomeDay,
          emergencyFundTargetMonths: toRateDecimal(persona.emergencyFundTargetMonths, 2),
          emergencyReserveAmount:
            persona.emergencyReserveAmount === null ? null : toDecimal(persona.emergencyReserveAmount),
          monthlyDebtPayments: toDecimal(persona.debtMonthly),
          totalDebtOutstanding: toDecimal(persona.totalDebtOutstanding),
          whatsappOptIn: persona.whatsappOptIn,
          onboardingCompleted: true,
        },
      },
      roles: { create: { roleId: customerRoleId } },
    },
  });

  // ---- accounts ----------------------------------------------------------
  const accountIds: string[] = [];
  let primaryAccountId = '';
  for (const [i, account] of persona.accounts.entries()) {
    const bankId = refs.bankByCode.get(account.bankCode ?? 'MRDN');
    if (!bankId) throw new Error(`Unknown bank code ${account.bankCode}`);
    const created = await prisma.bankAccount.create({
      data: {
        userId: user.id,
        bankId,
        externalId: `mock_${persona.key}_${i}`,
        maskedNumber: `••••${rng.int(1000, 9999)}`,
        nickname: account.nickname,
        type: account.type,
        currentBalance: toDecimal(account.balance),
        availableBalance: toDecimal(
          account.isLiability && account.creditLimit
            ? account.creditLimit - account.balance
            : account.balance,
        ),
        creditLimit: account.creditLimit ? toDecimal(account.creditLimit) : null,
        isLiability: Boolean(account.isLiability),
        isPrimary: Boolean(account.isPrimary),
        isEmergencyFund: Boolean(account.isEmergencyFund),
        lastSyncedAt: NOW,
      },
    });
    accountIds.push(created.id);
    if (account.isPrimary) primaryAccountId = created.id;
  }
  if (!primaryAccountId) primaryAccountId = accountIds[0] ?? '';

  // ---- transactions ------------------------------------------------------
  const generated = generateTransactions(persona, rng, NOW);
  await prisma.transaction.createMany({
    data: generated.map((txn, i) => ({
      userId: user.id,
      bankAccountId: primaryAccountId,
      categoryId: refs.categoryByKey.get(txn.categoryKey) ?? refs.categoryByKey.get('other')!,
      merchantId: txn.merchantName ? refs.merchantByName.get(txn.merchantName) ?? null : null,
      externalId: `mock_${persona.key}_txn_${i}`,
      amount: toDecimal(txn.amount),
      direction: txn.direction,
      status: 'POSTED',
      description: txn.description,
      occurredAt: txn.occurredAt,
      postedAt: txn.occurredAt,
      isRecurring: txn.isRecurring,
    })),
  });

  // ---- balance history ---------------------------------------------------
  const primaryAccount = persona.accounts.find((a) => a.isPrimary) ?? persona.accounts[0];
  if (primaryAccount) {
    const history = buildBalanceHistory(generated, primaryAccount.balance, NOW);
    await prisma.accountBalance.createMany({
      data: history.map((row) => ({
        bankAccountId: primaryAccountId,
        balance: toDecimal(row.balance),
        available: toDecimal(row.balance),
        recordedAt: row.recordedAt,
      })),
      skipDuplicates: true,
    });
  }

  // ---- obligations -------------------------------------------------------
  await prisma.recurringObligation.createMany({
    data: persona.obligations.map((o) => ({
      userId: user.id,
      label: o.label,
      amount: toDecimal(o.amount),
      categoryKey: o.categoryKey,
      categoryKind: categoryKind(o.categoryKey),
      dueDay: o.dueDay,
      isActive: true,
    })),
  });

  // ---- budget ------------------------------------------------------------
  const preset = presetFor(persona.strategy);
  const allocations = deriveAllocations(persona.income, persona.strategy);
  const budget = await prisma.budget.create({
    data: {
      userId: user.id,
      strategy: persona.strategy,
      month: monthKeyOf(NOW),
      periodStart: startOfMonth(NOW),
      periodEnd: endOfMonth(NOW),
      monthlyIncome: toDecimal(persona.income),
      needsPercent: toRateDecimal(preset.needsPercent, 2),
      wantsPercent: toRateDecimal(preset.wantsPercent, 2),
      savingsPercent: toRateDecimal(preset.savingsPercent, 2),
      investmentsPercent: toRateDecimal(preset.investmentsPercent, 2),
      debtPercent: toRateDecimal(preset.debtPercent, 2),
      isActive: true,
    },
  });
  await prisma.budgetCategory.createMany({
    data: allocations
      .filter((a) => refs.categoryByKey.has(a.categoryKey))
      .map((a) => ({
        budgetId: budget.id,
        categoryId: refs.categoryByKey.get(a.categoryKey)!,
        allocated: toDecimal(a.allocated),
      })),
    skipDuplicates: true,
  });
  if (persona.budgetRules?.length) {
    await prisma.budgetRule.createMany({
      data: persona.budgetRules.map((rule) => ({
        budgetId: budget.id,
        type: rule.type,
        categoryKey: rule.categoryKey,
        amount: toDecimal(rule.amount),
        label: rule.label,
      })),
    });
  }

  // ---- goals, investment profile, portfolio ------------------------------
  for (const goal of persona.goals) {
    await prisma.savingsGoal.create({
      data: {
        userId: user.id,
        name: goal.name,
        targetAmount: toDecimal(goal.targetAmount),
        currentAmount: toDecimal(goal.currentAmount),
        monthlyContribution: toDecimal(goal.monthlyContribution),
        targetDate: goal.monthsToTarget
          ? new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() + goal.monthsToTarget, 1))
          : null,
        status: 'ACTIVE',
      },
    });
  }

  await prisma.investmentProfile.create({
    data: {
      userId: user.id,
      riskTolerance: persona.riskTolerance,
      horizon: persona.horizon,
      monthlyInvestmentCapacity: toDecimal(persona.investmentMonthly),
      hasEmergencyFund: persona.accounts.some((a) => a.isEmergencyFund),
      liquidityNeedsMonths: toRateDecimal(persona.emergencyFundTargetMonths, 2),
      experienceLevel: persona.experienceLevel,
      goals: persona.goals.map((g) => g.name),
    },
  });

  const portfolioValue = persona.holdings.reduce((sum, h) => sum + h.currentValue, 0);
  if (persona.holdings.length > 0) {
    const portfolio = await prisma.portfolio.create({
      data: {
        userId: user.id,
        totalValue: toDecimal(portfolioValue),
        totalCost: toDecimal(persona.holdings.reduce((sum, h) => sum + h.investedAmount, 0)),
      },
    });
    for (const holding of persona.holdings) {
      const productId = refs.productByName.get(holding.productName) ?? null;
      const product = PRODUCTS.find((p) => p.name === holding.productName);
      await prisma.holding.create({
        data: {
          portfolioId: portfolio.id,
          productId,
          name: holding.productName,
          type: product?.type ?? 'INDEX_FUND',
          units: toRateDecimal(holding.investedAmount / 100, 4),
          investedAmount: toDecimal(holding.investedAmount),
          currentValue: toDecimal(holding.currentValue),
          bucket: product?.bucket ?? null,
        },
      });
    }
  }

  // ---- engine context ----------------------------------------------------
  const ctx: EngineContext = {
    userId: user.id,
    asOf: NOW.toISOString(),
    currency: 'INR',
    accounts: persona.accounts.map((a, i) => ({
      id: accountIds[i] ?? `acct_${i}`,
      type: a.type,
      balance: a.balance,
      availableBalance:
        a.isLiability && a.creditLimit ? a.creditLimit - a.balance : a.balance,
      isLiability: Boolean(a.isLiability),
      isEmergencyFund: Boolean(a.isEmergencyFund),
      currency: 'INR',
    })),
    transactions: generated.map((txn, i) => ({
      id: `${persona.key}_${i}`,
      amount: txn.amount,
      direction: txn.direction,
      occurredAt: txn.occurredAt.toISOString(),
      categoryKey: txn.categoryKey,
      categoryKind: txn.categoryKind,
      merchantName: txn.merchantName,
      description: txn.description,
      isRecurring: txn.isRecurring,
      isPending: false,
    })),
    budget: {
      id: budget.id,
      strategy: persona.strategy,
      periodStart: startOfMonth(NOW).toISOString(),
      periodEnd: endOfMonth(NOW).toISOString(),
      monthlyIncome: persona.income,
      needsPercent: preset.needsPercent,
      wantsPercent: preset.wantsPercent,
      savingsPercent: preset.savingsPercent,
      investmentsPercent: preset.investmentsPercent,
      debtPercent: preset.debtPercent,
      allocations: allocations.map((a) => ({
        categoryKey: a.categoryKey,
        categoryKind: a.categoryKind,
        allocated: a.allocated,
      })),
      rules: (persona.budgetRules ?? []).map((r) => ({
        type: r.type,
        categoryKey: r.categoryKey,
        amount: r.amount,
        label: r.label,
      })),
    },
    recurringObligations: persona.obligations.map((o) => ({
      label: o.label,
      amount: o.amount,
      dueDay: o.dueDay,
      categoryKey: o.categoryKey,
      categoryKind: categoryKind(o.categoryKey),
    })),
    emergencyFundTargetMonths: persona.emergencyFundTargetMonths,
    emergencyReserveAmount: persona.emergencyReserveAmount,
    monthlyDebtPayments: persona.debtMonthly,
    totalDebtOutstanding: persona.totalDebtOutstanding,
    declaredMonthlyIncome: persona.income,
    savingsGoals: persona.goals.map((g, i) => ({
      id: `${persona.key}_goal_${i}`,
      name: g.name,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      targetDate: null,
      monthlyContribution: g.monthlyContribution,
    })),
    investmentContributionsThisMonth: 0,
    portfolioValue,
  };

  return { userId: user.id, persona, ctx };
}

// ------------------------------------------- derived analytics (real engine)

/** Purchases each persona actually considered, replayed through the engine. */
const DEMO_PURCHASES: Record<string, PurchaseRequest[]> = {
  shaun: [
    { price: 50_000, category: 'shopping', merchant: 'Croma', description: 'PlayStation 5', importance: 2 },
    { price: 4_200, category: 'dining', merchant: 'Toit Brewpub', description: 'Birthday dinner', importance: 3 },
    { price: 18_000, category: 'shopping', merchant: 'Croma', description: 'Smartphone upgrade', importance: 3 },
  ],
  ananya: [
    { price: 95_000, category: 'travel', merchant: 'MakeMyTrip', description: 'Japan flights', importance: 3 },
    { price: 22_000, category: 'shopping', merchant: 'Apple', description: 'Noise cancelling headphones', importance: 2 },
  ],
  vikram: [
    { price: 65_000, category: 'shopping', merchant: 'Croma', description: 'Commercial refrigerator', importance: 5 },
  ],
  priya: [
    { price: 12_000, category: 'shopping', merchant: 'Myntra', description: 'Winter wardrobe', importance: 2 },
    { price: 3_500, category: 'education', merchant: 'Coursera', description: 'Analytics certification', importance: 4 },
  ],
  rohan: [{ price: 35_000, category: 'travel', merchant: 'IRCTC', description: 'Family holiday', importance: 3 }],
  meera: [{ price: 180_000, category: 'shopping', merchant: 'Croma', description: 'Home theatre system', importance: 2 }],
  arjun: [
    { price: 70_000, category: 'shopping', merchant: 'Croma', description: 'Laptop upgrade', importance: 4 },
    { price: 1_800, category: 'subscriptions', merchant: 'Spotify', description: 'Annual music plan', isRecurring: true, monthlyCost: 150, importance: 2 },
  ],
  fatima: [{ price: 48_000, category: 'shopping', merchant: 'Amazon', description: 'Drawing tablet', importance: 4 }],
  karthik: [{ price: 26_000, category: 'travel', merchant: 'IRCTC', description: 'Family trip to Ooty', importance: 3 }],
  nisha: [
    { price: 42_000, category: 'travel', merchant: 'IndiGo', description: 'Goa weekend', importance: 1 },
    { price: 9_500, category: 'dining', merchant: 'Zomato', description: 'Anniversary dinner', importance: 3 },
  ],
};

async function seedDerivedAnalytics(seeded: SeededUser[]) {
  for (const { userId, persona, ctx } of seeded) {
    const { snapshot, internals } = buildSnapshot(ctx);
    const health = computeFinancialHealth(snapshot, internals);

    const snapshotRow = await prisma.financialSnapshot.create({
      data: {
        userId,
        asOf: NOW,
        totalBalance: toDecimal(snapshot.totalBalance),
        availableBalance: toDecimal(snapshot.availableBalance),
        netWorth: toDecimal(snapshot.netWorth),
        monthlyIncome: toDecimal(snapshot.monthlyIncome),
        totalSpentThisPeriod: toDecimal(snapshot.totalSpentThisPeriod),
        essentialExpensesRemaining: toDecimal(snapshot.essentialExpensesRemaining),
        discretionaryBudgetRemaining: toDecimal(snapshot.discretionaryBudgetRemaining),
        savingsTarget: toDecimal(snapshot.savingsTarget),
        savingsProgress: toDecimal(snapshot.savingsProgress),
        emergencyFundMonths: toRateDecimal(snapshot.emergencyFundMonths, 2),
        safelySpendableCash: toDecimal(snapshot.safelySpendableCash),
        projectedSavingsRatePercent: toRateDecimal(snapshot.projectedSavingsRatePercent, 2),
        payload: snapshot as unknown as Prisma.InputJsonValue,
        engineVersion: ENGINE_VERSION,
      },
    });

    // Health trend: re-run the engine as at the end of each prior month.
    for (let back = 4; back >= 0; back -= 1) {
      const asOf =
        back === 0
          ? NOW
          : new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - back + 1, 0, 23, 59, 0));
      const historical = buildSnapshot({ ...ctx, asOf: asOf.toISOString() });
      const historicalHealth = computeFinancialHealth(historical.snapshot, historical.internals);
      await prisma.financialHealthScore.create({
        data: {
          userId,
          snapshotId: back === 0 ? snapshotRow.id : null,
          score: toRateDecimal(historicalHealth.score, 2),
          riskLevel: historicalHealth.riskLevel,
          month: monthKeyOf(asOf),
          components: historicalHealth.components as unknown as Prisma.InputJsonValue,
          strengths: historicalHealth.strengths,
          weaknesses: historicalHealth.weaknesses,
          engineVersion: ENGINE_VERSION,
          createdAt: asOf,
        },
      });
    }

    // Purchase history, computed by the real decision engine.
    const requests = DEMO_PURCHASES[persona.key] ?? [];
    for (const [i, request] of requests.entries()) {
      const decision = evaluatePurchase({ snapshot, internals, request });
      const createdAt = new Date(NOW.getTime() - (i + 1) * 3 * 86_400_000);
      const row = await prisma.purchaseDecision.create({
        data: {
          userId,
          snapshotId: snapshotRow.id,
          description: request.description ?? 'Purchase',
          merchant: request.merchant ?? null,
          categoryKey: request.category,
          price: toDecimal(request.price),
          isRecurring: Boolean(request.isRecurring),
          monthlyCost: request.monthlyCost ? toDecimal(request.monthlyCost) : null,
          importance: request.importance ?? 3,
          verdict: decision.verdict,
          score: toRateDecimal(decision.score, 2),
          confidence: toRateDecimal(decision.confidence, 2),
          affordabilityGap: toDecimal(decision.affordabilityGap),
          budgetImpactPercentage: toRateDecimal(decision.budgetImpactPercentage, 2),
          primaryReasons: decision.primaryReasons,
          payload: decision as unknown as Prisma.InputJsonValue,
          channel: i === 0 ? 'WHATSAPP' : 'WEB',
          engineVersion: ENGINE_VERSION,
          createdAt,
        },
      });
      await prisma.purchaseDecisionFactor.createMany({
        data: decision.factors.map((factor) => ({
          decisionId: row.id,
          key: factor.key,
          label: factor.label,
          score: toRateDecimal(factor.score, 2),
          weight: toRateDecimal(factor.weight, 4),
          contribution: toRateDecimal(factor.contribution, 2),
          detail: factor.detail,
          inputs: factor.inputs as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    // A couple of notifications so the bell is not empty on first login.
    await prisma.notification.createMany({
      data: [
        {
          userId,
          type: 'MONTHLY_REPORT_READY',
          channel: 'IN_APP',
          title: 'Your monthly report is ready',
          body: `Your ${monthKeyOf(new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - 1, 1)))} financial report has been generated.`,
          sentAt: new Date(NOW.getTime() - 2 * 86_400_000),
        },
        {
          userId,
          type: health.score < 55 ? 'BUDGET_ALERT' : 'SAVINGS_MILESTONE',
          channel: 'IN_APP',
          title:
            health.score < 55
              ? 'Your financial health needs attention'
              : 'You are on track this month',
          body: `Financial health score: ${health.score}/100 (${health.riskLevel.toLowerCase()} risk).`,
          sentAt: new Date(NOW.getTime() - 86_400_000),
        },
      ],
    });
  }
}

// ---------------------------------------------------------------- main ----

async function main() {
  const started = Date.now();
  console.log('▸ Resetting database…');
  await reset();

  console.log('▸ Seeding permissions and roles…');
  const roleByKey = await seedRbac();

  console.log('▸ Seeding categories, banks, merchants and products…');
  const refs = await seedCatalogue();

  console.log('▸ Seeding AI agents…');
  await seedAgents(roleByKey);

  console.log('▸ Seeding staff accounts…');
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  for (const staff of STAFF) {
    await prisma.user.create({
      data: {
        email: staff.email,
        passwordHash,
        fullName: staff.fullName,
        phone: staff.phone,
        status: 'ACTIVE',
        profile: { create: { occupation: 'Bank Staff', onboardingCompleted: true } },
        roles: {
          create: staff.roleKeys
            .map((key) => roleByKey.get(key))
            .filter((id): id is string => Boolean(id))
            .map((roleId) => ({ roleId })),
        },
      },
    });
  }

  console.log('▸ Seeding customers and six months of transactions…');
  const customerRoleId = roleByKey.get('CUSTOMER');
  if (!customerRoleId) throw new Error('CUSTOMER role missing');
  const seeded: SeededUser[] = [];
  for (const [index, persona] of PERSONAS.entries()) {
    seeded.push(await seedPersona(persona, index, refs, customerRoleId, passwordHash));
    process.stdout.write(`  · ${persona.fullName}\n`);
  }

  console.log('▸ Running the financial engine over seeded data…');
  await seedDerivedAnalytics(seeded);

  await prisma.systemSetting.createMany({
    data: [
      { key: 'platform.name', value: 'FlowMoney AI' },
      { key: 'risk.maxDebtToIncomePercent', value: 36 },
      { key: 'ai.defaultModel', value: process.env.OPENAI_MODEL ?? 'gpt-4o-mini' },
    ],
  });

  const counts = {
    users: await prisma.user.count(),
    accounts: await prisma.bankAccount.count(),
    transactions: await prisma.transaction.count(),
    decisions: await prisma.purchaseDecision.count(),
    agents: await prisma.aIAgent.count(),
    products: await prisma.financialProduct.count(),
  };

  console.log('\n✓ Seed complete in %ss', ((Date.now() - started) / 1000).toFixed(1));
  console.table(counts);
  console.log(`\n  Demo login — every account uses the password: ${DEFAULT_PASSWORD}`);
  console.log('  Customer : shaun@flowmoney.dev   (the reference scenario)');
  console.log('  Admin    : admin@flowmoney.dev');
  console.log('  Super    : root@flowmoney.dev\n');
}

main()
  .catch((error) => {
    console.error('\n✗ Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
