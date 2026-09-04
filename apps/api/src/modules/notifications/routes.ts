import { prisma } from '@flowmoney/database';
import { paginationSchema, uuid } from '@flowmoney/shared-types';
import type { FastifyInstance } from 'fastify';
import { paginate, skipTake } from '../../lib/pagination';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/notifications', {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const { page, pageSize } = paginationSchema.parse(request.query ?? {});
      const where = { userId: request.auth!.userId };
      const [rows, total, unread] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          ...skipTake(page, pageSize),
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { ...where, readAt: null } }),
      ]);
      return { ...paginate(rows, total, page, pageSize), unread };
    },
  });

  app.post('/notifications/:id/read', {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      await prisma.notification.updateMany({
        where: { id, userId: request.auth!.userId, readAt: null },
        data: { readAt: new Date() },
      });
      return { ok: true };
    },
  });

  app.post('/notifications/read-all', {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const result = await prisma.notification.updateMany({
        where: { userId: request.auth!.userId, readAt: null },
        data: { readAt: new Date() },
      });
      return { ok: true, updated: result.count };
    },
  });
}
