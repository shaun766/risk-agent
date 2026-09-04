import { Prisma, prisma, toNumber } from '@flowmoney/database';
import { ENGINE_VERSION, type MonthlyReportData } from '@flowmoney/shared-types';
import {
  buildMonthlyReport,
  buildSnapshot,
  computeBudgetStatus,
  computeFinancialHealth,
  monthKeyOf,
  parseMonthKey,
} from '@flowmoney/financial-engine';
import { badRequest } from '../lib/errors';
import { loadEngineContext } from './engine-context';
import { healthTrend } from './financial.service';

function endOfMonth(month: string): Date {
  const start = parseMonthKey(month);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

/**
 * Builds a monthly report from deterministic analytics.
 *
 * Reports for completed months are cached in the database because their inputs
 * can no longer change; the in-flight month is always recomputed.
 */
export async function generateMonthlyReport(
  userId: string,
  month?: string,
  options: { regenerate?: boolean } = {},
): Promise<MonthlyReportData> {
  const targetMonth = month ?? monthKeyOf(new Date());
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
    throw badRequest(`Invalid month "${targetMonth}" — expected YYYY-MM`);
  }

  const currentMonth = monthKeyOf(new Date());
  const isPast = targetMonth < currentMonth;

  if (isPast && !options.regenerate) {
    const cached = await prisma.monthlyReport.findUnique({
      where: { userId_month: { userId, month: targetMonth } },
    });
    if (cached && cached.status === 'READY') {
      return cached.data as unknown as MonthlyReportData;
    }
  }

  // Compute as at the end of the requested month so a past report reflects that
  // month's position rather than today's.
  const asOf = isPast ? endOfMonth(targetMonth) : new Date();
  const ctx = await loadEngineContext(userId, asOf);
  const { snapshot, internals } = buildSnapshot(ctx);
  const health = computeFinancialHealth(snapshot, internals);
  const budgetStatus = computeBudgetStatus(ctx, snapshot, internals);

  const decisions = await prisma.purchaseDecision.findMany({
    where: {
      userId,
      createdAt: { gte: parseMonthKey(targetMonth), lte: endOfMonth(targetMonth) },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const report = buildMonthlyReport({
    ctx,
    snapshot,
    internals,
    health,
    budgetStatus,
    healthTrend: await healthTrend(userId, 12),
    purchaseDecisions: decisions.map((decision) => ({
      description: decision.description,
      price: toNumber(decision.price),
      verdict: decision.verdict,
      score: toNumber(decision.score),
      createdAt: decision.createdAt.toISOString(),
    })),
  });

  await prisma.monthlyReport.upsert({
    where: { userId_month: { userId, month: targetMonth } },
    create: {
      userId,
      month: targetMonth,
      status: 'READY',
      data: report as unknown as Prisma.InputJsonValue,
      generatedAt: new Date(),
      engineVersion: ENGINE_VERSION,
    },
    update: {
      status: 'READY',
      data: report as unknown as Prisma.InputJsonValue,
      generatedAt: new Date(),
      engineVersion: ENGINE_VERSION,
    },
  });

  return report;
}

export async function attachReportNarrative(
  userId: string,
  month: string,
  narrative: string,
): Promise<void> {
  await prisma.monthlyReport.update({
    where: { userId_month: { userId, month } },
    data: { narrative },
  });
}

export async function listReports(userId: string): Promise<
  Array<{ month: string; status: string; generatedAt: Date | null; hasNarrative: boolean }>
> {
  const rows = await prisma.monthlyReport.findMany({
    where: { userId },
    orderBy: { month: 'desc' },
    select: { month: true, status: true, generatedAt: true, narrative: true },
  });
  return rows.map((row) => ({
    month: row.month,
    status: row.status,
    generatedAt: row.generatedAt,
    hasNarrative: Boolean(row.narrative),
  }));
}
