import { prisma } from '@flowmoney/database';
import { logger } from './lib/logger';
import { startScheduler } from './scheduler';

async function main(): Promise<void> {
  logger.info('FlowMoney worker starting…');

  const { queue, worker, connection } = await startScheduler();
  logger.info('Scheduler ready — health, idle-cash, anomaly, budget-alert and monthly-report jobs registered');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    try {
      await worker.close();
      await queue.close();
      await connection.quit();
      await prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled rejection');
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start worker:', error);
  process.exit(1);
});
