import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './config/env';
import { logger } from './lib/logger';
import { runAnomalyJob } from './jobs/anomaly.job';
import { runBudgetAlertJob } from './jobs/budget-alert.job';
import { runHealthSnapshotJob } from './jobs/health-snapshot.job';
import { runIdleCashJob } from './jobs/idle-cash.job';
import { runMonthlyReportJob } from './jobs/monthly-report.job';

const QUEUE_NAME = 'flowmoney-scheduler';

type JobName = 'health-snapshot' | 'idle-cash' | 'anomaly' | 'budget-alert' | 'monthly-report';

const HANDLERS: Record<JobName, () => Promise<unknown>> = {
  'health-snapshot': runHealthSnapshotJob,
  'idle-cash': runIdleCashJob,
  anomaly: runAnomalyJob,
  'budget-alert': runBudgetAlertJob,
  'monthly-report': runMonthlyReportJob,
};

export function createConnection(): IORedis {
  // BullMQ requires this exact setting — it manages retries itself.
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export async function startScheduler(): Promise<{ queue: Queue; worker: Worker; connection: IORedis }> {
  const connection = createConnection();
  const queue = new Queue(QUEUE_NAME, { connection });

  const sweepEvery = `every:${env.SWEEP_INTERVAL_MINUTES}m`;
  const reportCheckEvery = `every:${env.MONTHLY_REPORT_CHECK_MINUTES}m`;

  // Repeatable jobs are idempotent to register — BullMQ dedupes by job name +
  // repeat key, so restarting the worker never produces duplicate schedules.
  await queue.add('health-snapshot', {}, {
    repeat: { every: env.SWEEP_INTERVAL_MINUTES * 60_000 },
    jobId: sweepEvery + ':health-snapshot',
  });
  await queue.add('idle-cash', {}, {
    repeat: { every: env.SWEEP_INTERVAL_MINUTES * 60_000 },
    jobId: sweepEvery + ':idle-cash',
  });
  await queue.add('anomaly', {}, {
    repeat: { every: env.SWEEP_INTERVAL_MINUTES * 60_000 },
    jobId: sweepEvery + ':anomaly',
  });
  await queue.add('budget-alert', {}, {
    repeat: { every: env.SWEEP_INTERVAL_MINUTES * 60_000 },
    jobId: sweepEvery + ':budget-alert',
  });
  await queue.add('monthly-report', {}, {
    repeat: { every: env.MONTHLY_REPORT_CHECK_MINUTES * 60_000 },
    jobId: reportCheckEvery + ':monthly-report',
  });

  // Kick an immediate run of each on boot so a fresh `docker compose up` shows
  // populated notifications and health history without waiting a full cycle.
  for (const name of Object.keys(HANDLERS) as JobName[]) {
    await queue.add(name, {}, { jobId: `boot:${name}:${Date.now()}` });
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const handler = HANDLERS[job.name as JobName];
      if (!handler) {
        logger.warn({ jobName: job.name }, 'no handler registered for job');
        return;
      }
      logger.info({ jobName: job.name, jobId: job.id }, 'job starting');
      const result = await handler();
      logger.info({ jobName: job.name, jobId: job.id, result }, 'job finished');
      return result;
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, error) => {
    logger.error({ err: error, jobName: job?.name, jobId: job?.id }, 'job failed');
  });

  return { queue, worker, connection };
}
