import { Prisma, prisma, toDecimal, toRateDecimal } from '@flowmoney/database';
import {
  ENGINE_VERSION,
  type BudgetStatus,
  type EngineContext,
  type FinancialHealth,
  type FinancialSnapshot,
} from '@flowmoney/shared-types';
import {
  buildSnapshot,
  computeBudgetStatus,
  computeFinancialHealth,
  monthKeyOf,
  type SnapshotInternals,
} from '@flowmoney/financial-engine';
import { cacheGet, cacheSet, cacheInvalidate } from '../lib/redis';
import { loadEngineContext } from './engine-context';

export interface FinancialView {
  ctx: EngineContext;
  snapshot: FinancialSnapshot;
  internals: SnapshotInternals;
}

const CACHE_TTL_SECONDS = 45;
const snapshotKey = (userId: string) => `snapshot:${userId}`;

/**
 * Loads a user's financial position.
 *
 * The snapshot is cached briefly because a single AI turn may call several
 * tools that each need it; recomputing per tool would multiply the query load
 * without changing the answer. Any write that moves money invalidates the key.
 */
export async function getFinancialView(userId: string, asOf?: Date): Promise<FinancialView> {
  const ctx = await loadEngineContext(userId, asOf);
  const { snapshot, internals } = buildSnapshot(ctx);
  return { ctx, snapshot, internals };
}

export async function getCachedSnapshot(userId: string): Promise<FinancialSnapshot> {
  const cached = await cacheGet<FinancialSnapshot>(snapshotKey(userId));
  if (cached) return cached;
  const { snapshot } = await getFinancialView(userId);
  await cacheSet(snapshotKey(userId), snapshot, CACHE_TTL_SECONDS);
  return snapshot;
}

export async function invalidateFinancialCache(userId: string): Promise<void> {
  await cacheInvalidate(snapshotKey(userId));
}

/**
 * Persists a snapshot so a decision made against it can be reproduced later.
 * Returns the row id, which purchase decisions and health scores reference.
 */
export async function persistSnapshot(
  userId: string,
  snapshot: FinancialSnapshot,
): Promise<string> {
  const row = await prisma.financialSnapshot.create({
    data: {
      userId,
      asOf: new Date(snapshot.asOf),
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
    select: { id: true },
  });
  return row.id;
}

export function computeHealth(view: FinancialView): FinancialHealth {
  return computeFinancialHealth(view.snapshot, view.internals);
}

export async function persistHealth(
  userId: string,
  health: FinancialHealth,
  snapshotId: string | null,
  asOf: Date,
): Promise<void> {
  const month = monthKeyOf(asOf);
  const existing = await prisma.financialHealthScore.findFirst({
    where: { userId, month },
    orderBy: { createdAt: 'desc' },
  });

  const data = {
    userId,
    snapshotId,
    score: toRateDecimal(health.score, 2),
    riskLevel: health.riskLevel,
    month,
    components: health.components as unknown as Prisma.InputJsonValue,
    strengths: health.strengths,
    weaknesses: health.weaknesses,
    engineVersion: ENGINE_VERSION,
  };

  // One authoritative score per month, refreshed as the month progresses.
  if (existing) {
    await prisma.financialHealthScore.update({ where: { id: existing.id }, data });
  } else {
    await prisma.financialHealthScore.create({ data });
  }
}

export function budgetStatusOf(view: FinancialView): BudgetStatus {
  return computeBudgetStatus(view.ctx, view.snapshot, view.internals);
}

export async function healthTrend(
  userId: string,
  months = 6,
): Promise<Array<{ month: string; score: number }>> {
  const rows = await prisma.financialHealthScore.findMany({
    where: { userId },
    orderBy: { month: 'asc' },
    select: { month: true, score: true },
  });
  const byMonth = new Map(rows.map((row) => [row.month, Number(row.score)]));
  return [...byMonth.entries()]
    .map(([month, score]) => ({ month, score }))
    .slice(-months);
}
