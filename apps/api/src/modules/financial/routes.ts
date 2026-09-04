import { Permission } from '@flowmoney/shared-types';
import {
  analyseIdleCash,
  detectSpendingAnomalies,
  findSavingsOpportunities,
} from '@flowmoney/financial-engine';
import type { FastifyInstance } from 'fastify';
import {
  computeHealth,
  getFinancialView,
  persistHealth,
  healthTrend,
} from '../../services/financial.service';

export async function financialRoutes(app: FastifyInstance): Promise<void> {
  app.get('/financial-snapshot', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_ACCOUNTS)],
    handler: async (request) => {
      const view = await getFinancialView(request.auth!.userId);
      return view.snapshot;
    },
  });

  app.get('/financial-health', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_FINANCIAL_HEALTH)],
    handler: async (request) => {
      const userId = request.auth!.userId;
      const view = await getFinancialView(userId);
      const health = computeHealth(view);
      // Keep the monthly score row current so the trend chart stays accurate.
      await persistHealth(userId, health, null, new Date(view.snapshot.asOf));
      return { ...health, trend: await healthTrend(userId) };
    },
  });

  app.get('/financial/idle-cash', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_ACCOUNTS)],
    handler: async (request) => {
      const view = await getFinancialView(request.auth!.userId);
      return analyseIdleCash(view.snapshot, view.internals);
    },
  });

  app.get('/financial/savings-opportunities', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_TRANSACTIONS)],
    handler: async (request) => {
      const view = await getFinancialView(request.auth!.userId);
      return {
        opportunities: findSavingsOpportunities(view.ctx, view.snapshot, view.internals),
        idleCash: analyseIdleCash(view.snapshot, view.internals),
      };
    },
  });

  app.get('/financial/anomalies', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_TRANSACTIONS)],
    handler: async (request) => {
      const view = await getFinancialView(request.auth!.userId);
      return { anomalies: detectSpendingAnomalies(view.ctx, view.snapshot, view.internals) };
    },
  });
}
