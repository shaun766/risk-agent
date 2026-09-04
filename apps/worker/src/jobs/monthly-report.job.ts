import { Prisma, prisma, toNumber } from '@flowmoney/database';
import { ENGINE_VERSION, NotificationType } from '@flowmoney/shared-types';
import {
  buildMonthlyReport,
  buildSnapshot,
  computeBudgetStatus,
  computeFinancialHealth,
  monthKeyOf,
  parseMonthKey,
} from '@flowmoney/financial-engine';
import { loadEngineContext } from '../lib/engine-context';
import { activeUserIds, notifyOnce } from '../lib/users';
import { logger } from '../lib/logger';

function endOfMonth(month: string): Date {
  const start = parseMonthKey(month);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function previousMonthKey(now: Date): string {
  return monthKeyOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

async function healthTrendFor(userId: string, months = 12): Promise<Array<{ month: string; score: number }>> {
  const rows = await prisma.financialHealthScore.findMany({
    where: { userId },
    orderBy: { month: 'asc' },
    select: { month: true, score: true },
  });
  const byMonth = new Map(rows.map((row) => [row.month, Number(row.score)]));
  return [...byMonth.entries()].map(([month, score]) => ({ month, score })).slice(-months);
}

/**
 * Generates last month's report for every user once it is complete, the same
 * way a bank statement lands automatically at month start — a user should
 * never have to remember to ask for it.
 */
export async function runMonthlyReportJob(): Promise<{ generated: number; skipped: number }> {
  const targetMonth = previousMonthKey(new Date());
  const userIds = await activeUserIds();
  let generated = 0;
  let skipped = 0;

  for (const userId of userIds) {
    try {
      const existing = await prisma.monthlyReport.findUnique({
        where: { userId_month: { userId, month: targetMonth } },
      });
      if (existing?.status === 'READY') {
        skipped += 1;
        continue;
      }

      const asOf = endOfMonth(targetMonth);
      const ctx = await loadEngineContext(userId, asOf);
      const { snapshot, internals } = buildSnapshot(ctx);
      const health = computeFinancialHealth(snapshot, internals);
      const budgetStatus = computeBudgetStatus(ctx, snapshot, internals);

      const decisions = await prisma.purchaseDecision.findMany({
        where: { userId, createdAt: { gte: parseMonthKey(targetMonth), lte: asOf } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const report = buildMonthlyReport({
        ctx,
        snapshot,
        internals,
        health,
        budgetStatus,
        healthTrend: await healthTrendFor(userId),
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

      await notifyOnce({
        userId,
        type: NotificationType.MONTHLY_REPORT_READY,
        title: `Your ${monthLabel(targetMonth)} report is ready`,
        body: `Income ${Math.round(report.overview.income)}, spending ${Math.round(report.overview.totalSpending)}, savings rate ${Math.round(report.overview.savingsRatePercent)}%. Open Reports to see the full breakdown.`,
        data: { month: targetMonth },
        dedupeWindowHours: 24 * 25,
      });

      generated += 1;
    } catch (error) {
      logger.error({ err: error, userId, month: targetMonth }, 'monthly-report job failed for user');
    }
  }

  logger.info({ generated, skipped, month: targetMonth }, 'monthly-report job complete');
  return { generated, skipped };
}
