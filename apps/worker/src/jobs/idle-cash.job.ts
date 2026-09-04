import { NotificationType, formatINR } from '@flowmoney/shared-types';
import { analyseIdleCash, buildSnapshot } from '@flowmoney/financial-engine';
import { loadEngineContext } from '../lib/engine-context';
import { activeUserIds, notifyOnce } from '../lib/users';
import { logger } from '../lib/logger';

/**
 * Surfaces idle cash proactively instead of waiting for the user to ask.
 * Never moves money — only raises a notification pointing at the allocation
 * simulator, same disclaimer the API attaches to `/investment/recommendations`.
 */
export async function runIdleCashJob(): Promise<{ notified: number }> {
  const userIds = await activeUserIds();
  let notified = 0;

  for (const userId of userIds) {
    try {
      const ctx = await loadEngineContext(userId);
      const { snapshot, internals } = buildSnapshot(ctx);
      const idleCash = analyseIdleCash(snapshot, internals);

      if (!idleCash.hasSurplus || idleCash.surplusCash < 1000) continue;

      const created = await notifyOnce({
        userId,
        type: NotificationType.IDLE_CASH_DETECTED,
        title: 'You have idle cash',
        body: `About ${formatINR(idleCash.surplusCash)} looks surplus to your next 30 days of expenses and your emergency reserve. See allocation ideas in Investments.`,
        data: { surplusCash: idleCash.surplusCash },
        dedupeWindowHours: 24 * 7,
      });
      if (created) notified += 1;
    } catch (error) {
      logger.error({ err: error, userId }, 'idle-cash job failed for user');
    }
  }

  logger.info({ notified }, 'idle-cash job complete');
  return { notified };
}
