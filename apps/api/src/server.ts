import { prisma } from '@flowmoney/database';
import Fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { env } from './config/env';
import { registerErrorHandler } from './lib/errors';
import { loggerOptions } from './lib/logger';
import { registerPlugins } from './plugins';
import { accountRoutes } from './modules/accounts/routes';
import { adminRoutes } from './modules/admin/routes';
import { aiRoutes } from './modules/ai/routes';
import { authRoutes } from './modules/auth/routes';
import { budgetRoutes } from './modules/budget/routes';
import { financialRoutes } from './modules/financial/routes';
import { goalRoutes } from './modules/goals/routes';
import { investmentRoutes } from './modules/investments/routes';
import { notificationRoutes } from './modules/notifications/routes';
import { paymentRoutes } from './modules/payments/routes';
import { purchaseRoutes } from './modules/purchase/routes';
import { reportRoutes } from './modules/reports/routes';
import { transactionRoutes } from './modules/transactions/routes';
import { webhookRoutes } from './modules/webhooks/routes';

/**
 * Every route module, registered once per prefix. The unprefixed aliases keep
 * the documented paths (/auth/login, /purchase/analyze) working alongside the
 * versioned ones.
 */
async function registerRoutes(api: FastifyInstance): Promise<void> {
  await authRoutes(api);
  await accountRoutes(api);
  await transactionRoutes(api);
  await financialRoutes(api);
  await budgetRoutes(api);
  await purchaseRoutes(api);
  await goalRoutes(api);
  await aiRoutes(api);
  await reportRoutes(api);
  await investmentRoutes(api);
  await paymentRoutes(api);
  await notificationRoutes(api);
  await adminRoutes(api);
}

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(),
    genReqId: () => randomUUID(),
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
    // WhatsApp signature verification needs the exact bytes that were signed.
    disableRequestLogging: false,
  });

  await registerPlugins(app);
  registerErrorHandler(app);

  app.get('/health', async () => {
    const started = Date.now();
    let database: 'up' | 'down' = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'flowmoney-api',
      environment: env.NODE_ENV,
      database,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    };
  });

  await app.register(registerRoutes, { prefix: '/api/v1' });
  await app.register(registerRoutes);

  // Webhooks are unversioned and unauthenticated by design — they are secured
  // by provider signature verification, not by a bearer token.
  await app.register(webhookRoutes);

  return app;
}
