import { prisma, toNumber } from '@flowmoney/database';
import {
  Permission,
  allocationQuerySchema,
  investmentProfileSchema,
} from '@flowmoney/shared-types';
import type { FastifyInstance } from 'fastify';
import {
  buildRecommendation,
  getInvestmentProfile,
  persistRecommendation,
  searchProducts,
  upsertInvestmentProfile,
} from '../../services/investment.service';

export async function investmentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/investment/profile', {
    preHandler: [app.requirePermission(Permission.VIEW_PORTFOLIO)],
    handler: async (request) => getInvestmentProfile(request.auth!.userId),
  });

  app.post('/investment/profile', {
    preHandler: [app.requirePermission(Permission.MANAGE_INVESTMENT_PROFILE)],
    handler: async (request) => {
      const input = investmentProfileSchema.parse(request.body);
      return upsertInvestmentProfile(request.auth!.userId, input);
    },
  });

  /**
   * Allocation guidance. Explicitly a simulation: the response always carries
   * the educational disclaimer and nothing here places an order.
   */
  app.get('/investment/recommendations', {
    preHandler: [app.requirePermission(Permission.VIEW_PORTFOLIO)],
    handler: async (request) => {
      const query = allocationQuerySchema.parse(request.query ?? {});
      const { idleCash, allocation } = await buildRecommendation(
        request.auth!.userId,
        query.surplus,
      );

      if (allocation) {
        await persistRecommendation(request.auth!.userId, allocation);
      }

      return {
        idleCash,
        allocation,
        products: allocation
          ? await searchProducts({
              maxMinimumInvestment: Math.max(
                ...allocation.suggestions.map((suggestion) => suggestion.amount),
                0,
              ),
            })
          : [],
      };
    },
  });

  app.get('/investment/products', {
    preHandler: [app.requirePermission(Permission.VIEW_FINANCIAL_PRODUCTS)],
    handler: async (request) => {
      const query = request.query as Record<string, string | undefined>;
      return {
        products: await searchProducts({
          type: query.type,
          riskLevel: query.riskLevel,
          bucket: query.bucket,
          maxMinimumInvestment: query.maxMinimumInvestment
            ? Number(query.maxMinimumInvestment)
            : undefined,
        }),
      };
    },
  });

  app.get('/investment/history', {
    preHandler: [app.requirePermission(Permission.VIEW_PORTFOLIO)],
    handler: async (request) => {
      const rows = await prisma.investmentRecommendation.findMany({
        where: { userId: request.auth!.userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      return {
        recommendations: rows.map((row) => ({
          id: row.id,
          surplusCash: toNumber(row.surplusCash),
          allocations: row.allocations,
          disclaimer: row.disclaimer,
          createdAt: row.createdAt,
        })),
      };
    },
  });
}
