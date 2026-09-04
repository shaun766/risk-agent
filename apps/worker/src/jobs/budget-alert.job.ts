import { NotificationType, formatINR } from '@flowmoney/shared-types';
import { buildSnapshot, computeBudgetStatus } from '@flowmoney/financial-engine';
import { loadEngineContext } from '../lib/engine-context';
import { activeUserIds, notifyOnce } from '../lib/users';
import { logger } from '../lib/logger';

const ADHERENCE_ALERT_THRESHOLD = 60;

/** Flags budget overspend once a day — adherence below threshold, or any active rule violation. */
export async function runBudgetAlertJob(): Promise<{ notified: number }> {
  const userIds = await activeUserIds();
  let notified = 0;

  for (const userId of userIds) {
    try {
      const ctx = await loadEngineContext(userId);
      const { snapshot, internals } = buildSnapshot(ctx);
      const status = computeBudgetStatus(ctx, snapshot, internals);
      if (!ctx.budget) continue;

      const worstViolation = status.ruleViolations[0];
      const shouldAlert = status.adherencePercent < ADHERENCE_ALERT_THRESHOLD || Boolean(worstViolation);
      if (!shouldAlert) continue;

      const body = worstViolation
        ? `${worstViolation.label}: ${formatINR(worstViolation.actual)} exceeds your ${formatINR(worstViolation.limit)} limit by ${formatINR(worstViolation.exceededBy)}.`
        : `Budget adherence has dropped to ${Math.round(status.adherencePercent)}% this month. Projected overspend: ${formatINR(status.projectedOverspend)}.`;

      const created = await notifyOnce({
        userId,
        type: NotificationType.BUDGET_ALERT,
        title: 'Budget check-in',
        body,
        data: { adherencePercent: status.adherencePercent, projectedOverspend: status.projectedOverspend },
        dedupeWindowHours: 24,
      });
      if (created) notified += 1;
    } catch (error) {
      logger.error({ err: error, userId }, 'budget-alert job failed for user');
    }
  }

  logger.info({ notified }, 'budget-alert job complete');
  return { notified };
}
