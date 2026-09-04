import { Prisma, prisma, toDecimal, toNumber } from '@flowmoney/database';
import {
  RiskTolerance,
  type AllocationPlan,
  type IdleCashAnalysis,
  type InvestmentProfileInput,
} from '@flowmoney/shared-types';
import { analyseIdleCash, buildAllocationPlan } from '@flowmoney/financial-engine';
import { getFinancialView } from './financial.service';

export interface ProductFilter {
  type?: string;
  riskLevel?: string;
  bucket?: string;
  maxMinimumInvestment?: number;
}

const RISK_ORDER: Record<string, number> = { LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 };

export async function searchProducts(filter: ProductFilter = {}) {
  const products = await prisma.financialProduct.findMany({
    where: {
      isActive: true,
      ...(filter.type ? { type: filter.type as Prisma.FinancialProductWhereInput['type'] } : {}),
      ...(filter.bucket
        ? { bucket: filter.bucket as Prisma.FinancialProductWhereInput['bucket'] }
        : {}),
      ...(filter.maxMinimumInvestment !== undefined
        ? { minimumInvestment: { lte: filter.maxMinimumInvestment } }
        : {}),
    },
    include: { rates: { orderBy: { tenureMonths: 'asc' } } },
    orderBy: { name: 'asc' },
  });

  const ceiling = filter.riskLevel ? (RISK_ORDER[filter.riskLevel] ?? 4) : 4;

  return products
    .filter((product) => (RISK_ORDER[product.riskLevel] ?? 4) <= ceiling)
    .map((product) => ({
      id: product.id,
      name: product.name,
      type: product.type,
      riskLevel: product.riskLevel,
      liquidity: product.liquidity,
      minimumInvestment: toNumber(product.minimumInvestment),
      interestRate: toNumber(product.interestRate),
      expectedReturnLow: toNumber(product.expectedReturnLow),
      expectedReturnHigh: toNumber(product.expectedReturnHigh),
      lockInMonths: product.lockInMonths,
      description: product.description,
      bucket: product.bucket,
      rates: product.rates.map((rate) => ({
        tenureMonths: rate.tenureMonths,
        rate: toNumber(rate.rate),
        minAmount: toNumber(rate.minAmount),
      })),
    }));
}

export async function getInvestmentProfile(userId: string) {
  const [profile, portfolio] = await Promise.all([
    prisma.investmentProfile.findUnique({ where: { userId } }),
    prisma.portfolio.findUnique({ where: { userId }, include: { holdings: true } }),
  ]);

  const holdings =
    portfolio?.holdings.map((holding) => ({
      id: holding.id,
      name: holding.name,
      type: holding.type,
      investedAmount: toNumber(holding.investedAmount),
      currentValue: toNumber(holding.currentValue),
      bucket: holding.bucket,
      gain: toNumber(holding.currentValue) - toNumber(holding.investedAmount),
      gainPercent:
        toNumber(holding.investedAmount) > 0
          ? Math.round(
              ((toNumber(holding.currentValue) - toNumber(holding.investedAmount)) /
                toNumber(holding.investedAmount)) *
                10_000,
            ) / 100
          : 0,
    })) ?? [];

  return {
    riskTolerance: profile?.riskTolerance ?? RiskTolerance.MODERATE,
    horizon: profile?.horizon ?? 'MEDIUM',
    monthlyInvestmentCapacity: toNumber(profile?.monthlyInvestmentCapacity),
    hasEmergencyFund: profile?.hasEmergencyFund ?? false,
    liquidityNeedsMonths: toNumber(profile?.liquidityNeedsMonths, 6),
    experienceLevel: profile?.experienceLevel ?? 'BEGINNER',
    goals: (profile?.goals as string[] | null) ?? [],
    portfolioValue: holdings.reduce((sum, holding) => sum + holding.currentValue, 0),
    totalInvested: holdings.reduce((sum, holding) => sum + holding.investedAmount, 0),
    holdings,
  };
}

export async function upsertInvestmentProfile(userId: string, input: InvestmentProfileInput) {
  await prisma.investmentProfile.upsert({
    where: { userId },
    create: {
      userId,
      riskTolerance: input.riskTolerance as Prisma.InvestmentProfileCreateInput['riskTolerance'],
      horizon: input.horizon as Prisma.InvestmentProfileCreateInput['horizon'],
      monthlyInvestmentCapacity: toDecimal(input.monthlyInvestmentCapacity),
      hasEmergencyFund: input.hasEmergencyFund,
      liquidityNeedsMonths: input.liquidityNeedsMonths,
      experienceLevel: input.experienceLevel,
      goals: input.goals,
    },
    update: {
      riskTolerance: input.riskTolerance as Prisma.InvestmentProfileCreateInput['riskTolerance'],
      horizon: input.horizon as Prisma.InvestmentProfileCreateInput['horizon'],
      monthlyInvestmentCapacity: toDecimal(input.monthlyInvestmentCapacity),
      hasEmergencyFund: input.hasEmergencyFund,
      liquidityNeedsMonths: input.liquidityNeedsMonths,
      experienceLevel: input.experienceLevel,
      goals: input.goals,
    },
  });
  return getInvestmentProfile(userId);
}

/**
 * Produces an allocation simulation for whatever cash is genuinely surplus.
 * Explicitly a simulation: nothing here moves money or places an order.
 */
export async function buildRecommendation(
  userId: string,
  overrideSurplus?: number,
): Promise<{ idleCash: IdleCashAnalysis; allocation: AllocationPlan | null }> {
  const view = await getFinancialView(userId);
  const idleCash = analyseIdleCash(view.snapshot, view.internals);
  const surplus = overrideSurplus ?? idleCash.surplusCash;

  if (surplus <= 0) return { idleCash, allocation: null };

  const [profile, products] = await Promise.all([
    prisma.investmentProfile.findUnique({ where: { userId } }),
    searchProducts(),
  ]);

  const allocation = buildAllocationPlan({
    surplus,
    snapshot: view.snapshot,
    internals: view.internals,
    ctx: view.ctx,
    riskTolerance: (profile?.riskTolerance ?? RiskTolerance.MODERATE) as RiskTolerance,
    products: products.map((product) => ({
      id: product.id,
      bucket: product.bucket,
      minimumInvestment: product.minimumInvestment,
    })),
  });

  return { idleCash, allocation };
}

export async function persistRecommendation(
  userId: string,
  allocation: AllocationPlan,
): Promise<string> {
  const row = await prisma.investmentRecommendation.create({
    data: {
      userId,
      surplusCash: toDecimal(allocation.surplusCash),
      allocations: allocation.suggestions as unknown as Prisma.InputJsonValue,
      disclaimer: allocation.disclaimer,
      riskLevel: 'MODERATE',
      engineVersion: '1.0.0',
    },
    select: { id: true },
  });
  return row.id;
}
