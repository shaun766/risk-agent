import { prisma } from '@flowmoney/database';
import {
  Permission,
  paginationSchema,
  purchaseAnalyzeSchema,
  uuid,
} from '@flowmoney/shared-types';
import type { FastifyInstance } from 'fastify';
import { notFound } from '../../lib/errors';
import { paginate } from '../../lib/pagination';
import { analyzePurchase, listPurchaseHistory } from '../../services/purchase.service';

export async function purchaseRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The deterministic analysis endpoint. No LLM is involved — the numbers here
   * are the same ones the AI is later given to explain.
   */
  app.post('/purchase/analyze', {
    preHandler: [app.requirePermission(Permission.REQUEST_PURCHASE_ANALYSIS)],
    handler: async (request) => {
      const input = purchaseAnalyzeSchema.parse(request.body);
      const { persist, ...purchase } = input;

      const result = await analyzePurchase({
        userId: request.auth!.userId,
        request: {
          price: purchase.price,
          category: purchase.category,
          merchant: purchase.merchant ?? null,
          description: purchase.description ?? null,
          purchaseDate: purchase.purchaseDate ?? null,
          isRecurring: purchase.isRecurring,
          monthlyCost: purchase.monthlyCost ?? null,
          importance: purchase.importance ?? null,
        },
        persist,
        channel: 'WEB',
        httpRequest: request,
      });

      return { decisionId: result.decisionId, snapshotId: result.snapshotId, ...result.decision };
    },
  });

  app.get('/purchase/history', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_PURCHASE_HISTORY)],
    handler: async (request) => {
      const { page, pageSize } = paginationSchema.parse(request.query ?? {});
      const { rows, total } = await listPurchaseHistory(request.auth!.userId, page, pageSize);
      return paginate(rows, total, page, pageSize);
    },
  });

  app.get('/purchase/:id', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_PURCHASE_HISTORY)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const decision = await prisma.purchaseDecision.findFirst({
        where: { id, userId: request.auth!.userId },
        include: { factors: true },
      });
      if (!decision) throw notFound('Purchase decision');
      return {
        id: decision.id,
        createdAt: decision.createdAt,
        channel: decision.channel,
        explanation: decision.explanation,
        wasPurchased: decision.wasPurchased,
        snapshotId: decision.snapshotId,
        ...(decision.payload as Record<string, unknown>),
      };
    },
  });

  /** Lets a user record that they went ahead, which feeds future behaviour analysis. */
  app.post('/purchase/:id/mark-purchased', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_PURCHASE_HISTORY)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const existing = await prisma.purchaseDecision.findFirst({
        where: { id, userId: request.auth!.userId },
      });
      if (!existing) throw notFound('Purchase decision');
      await prisma.purchaseDecision.update({ where: { id }, data: { wasPurchased: true } });
      return { ok: true };
    },
  });
}
