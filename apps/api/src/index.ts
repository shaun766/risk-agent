import { prisma } from '@flowmoney/database';
import { env } from './config/env';
import { closeRedis } from './lib/redis';
import { buildServer } from './server';

async function main(): Promise<void> {
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await prisma.$disconnect();
      await closeRedis();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'unhandled rejection');
  });

  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  app.log.info(`FlowMoney API listening on http://${env.API_HOST}:${env.API_PORT}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start API:', error);
  process.exit(1);
});
