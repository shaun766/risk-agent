import { NotificationType, formatINR } from '@flowmoney/shared-types';
import { buildSnapshot, detectSpendingAnomalies } from '@flowmoney/financial-engine';
import { prisma } from '@flowmoney/database';
import { loadEngineContext } from '../lib/engine-context';
import { activeUserIds } from '../lib/users';
import { logger } from '../lib/logger';

/**
 * Flags unusual transactions the same day they post. Only HIGH/CRITICAL
 * severity anomalies raise a notification — MODERATE ones are still visible
 * on-demand via `/financial/anomalies` but are too noisy to push proactively.
 * Deduped per transaction, not per day, since a single spike should only ever
 * notify once.
 */
export async function runAnomalyJob(): Promise<{ notified: number }> {
  const userIds = await activeUserIds();
  let notified = 0;

  for (const userId of userIds) {
    try {
      const ctx = await loadEngineContext(userId);
      const { snapshot, internals } = buildSnapshot(ctx);
      const anomalies = detectSpendingAnomalies(ctx, snapshot, internals).filter(
        (a) => a.severity === 'HIGH' || a.severity === 'CRITICAL',
      );

      for (const anomaly of anomalies) {
        if (!anomaly.transactionId) continue;

        const alreadyNotified = await prisma.notification.findFirst({
          where: {
            userId,
            type: NotificationType.ANOMALY_DETECTED,
            data: { path: ['transactionId'], equals: anomaly.transactionId },
          },
          select: { id: true },
        });
        if (alreadyNotified) continue;

        await prisma.notification.create({
          data: {
            userId,
            type: NotificationType.ANOMALY_DETECTED,
            channel: 'IN_APP',
            title: anomaly.title,
            body: `${anomaly.detail} (${formatINR(anomaly.amount)} vs a usual ${formatINR(anomaly.baseline)})`,
            data: { transactionId: anomaly.transactionId, deviationPercent: anomaly.deviationPercent },
            sentAt: new Date(),
          },
        });
        notified += 1;
      }
    } catch (error) {
      logger.error({ err: error, userId }, 'anomaly job failed for user');
    }
  }

  logger.info({ notified }, 'anomaly job complete');
  return { notified };
}
