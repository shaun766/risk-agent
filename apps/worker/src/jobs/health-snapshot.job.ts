import { Prisma, prisma, toRateDecimal, toDecimal } from '@flowmoney/database';
import { ENGINE_VERSION } from '@flowmoney/shared-types';
import { buildSnapshot, computeFinancialHealth, monthKeyOf } from '@flowmoney/financial-engine';
import { loadEngineContext } from '../lib/engine-context';
import { activeUserIds } from '../lib/users';
import { logger } from '../lib/logger';

/**
 * Recomputes every active user's financial snapshot and health score once a
 * day. This keeps the health-trend chart and the FinancialSnapshot history
 * populated for users who never open the dashboard on a given day — the API
 * only recomputes on request, so without this job trend lines would have
 * gaps for inactive users.
 */
export async function runHealthSnapshotJob(): Promise<{ processed: number; failed: number }> {
  const userIds = await activeUserIds();
  let processed = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const asOf = new Date();
      const ctx = await loadEngineContext(userId, asOf);
      const { snapshot, internals } = buildSnapshot(ctx);
      const health = computeFinancialHealth(snapshot, internals);

      const snapshotRow = await prisma.financialSnapshot.create({
        data: {
          userId,
          asOf,
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

      const month = monthKeyOf(asOf);
      const existingScore = await prisma.financialHealthScore.findFirst({
        where: { userId, month },
        orderBy: { createdAt: 'desc' },
      });
      const healthData = {
        userId,
        snapshotId: snapshotRow.id,
        score: toRateDecimal(health.score, 2),
        riskLevel: health.riskLevel,
        month,
        components: health.components as unknown as Prisma.InputJsonValue,
        strengths: health.strengths,
        weaknesses: health.weaknesses,
        engineVersion: ENGINE_VERSION,
      };
      if (existingScore) {
        await prisma.financialHealthScore.update({ where: { id: existingScore.id }, data: healthData });
      } else {
        await prisma.financialHealthScore.create({ data: healthData });
      }

      processed += 1;
    } catch (error) {
      failed += 1;
      logger.error({ err: error, userId }, 'health-snapshot job failed for user');
    }
  }

  logger.info({ processed, failed }, 'health-snapshot job complete');
  return { processed, failed };
}
