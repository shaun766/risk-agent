import { prisma, toNumber } from '@flowmoney/database';
import {
  Permission,
  confirmPaymentSchema,
  createPaymentIntentSchema,
  uuid,
} from '@flowmoney/shared-types';
import type { FastifyInstance } from 'fastify';
import { notFound } from '../../lib/errors';
import {
  cancelPaymentIntent,
  confirmPaymentIntent,
  createPaymentIntent,
} from '../../services/payment.service';

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Step one of two. Creating an intent never moves money — it returns a
   * confirmation phrase that the user must send back on the confirm endpoint.
   */
  app.post('/payments/intent', {
    preHandler: [app.requirePermission(Permission.AUTHORIZE_OWN_PAYMENT)],
    handler: async (request, reply) => {
      const input = createPaymentIntentSchema.parse(request.body);
      const intent = await createPaymentIntent({
        userId: request.auth!.userId,
        amount: input.amount,
        accountId: input.accountId,
        merchant: input.merchant,
        description: input.description,
        categoryKey: input.categoryKey,
        purchaseDecisionId: input.purchaseDecisionId ?? null,
      });
      return reply.status(201).send(intent);
    },
  });

  /** Step two: the explicit, user-supplied authorisation. */
  app.post('/payments/:id/confirm', {
    preHandler: [app.requirePermission(Permission.AUTHORIZE_OWN_PAYMENT)],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const input = confirmPaymentSchema.parse(request.body);
      return confirmPaymentIntent(request.auth!.userId, id, input.confirmationPhrase, 'WEB');
    },
  });

  app.post('/payments/:id/cancel', {
    preHandler: [app.requirePermission(Permission.AUTHORIZE_OWN_PAYMENT)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      return cancelPaymentIntent(request.auth!.userId, id);
    },
  });

  app.get('/payments', {
    preHandler: [app.requirePermission(Permission.AUTHORIZE_OWN_PAYMENT)],
    handler: async (request) => {
      const rows = await prisma.paymentIntent.findMany({
        where: { userId: request.auth!.userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { bankAccount: { select: { maskedNumber: true, nickname: true } } },
      });
      return {
        payments: rows.map((row) => ({
          id: row.id,
          amount: toNumber(row.amount),
          currency: row.currency,
          merchant: row.merchant,
          description: row.description,
          status: row.status,
          account: row.bankAccount,
          authorizedVia: row.authorizedVia,
          completedAt: row.completedAt,
          expiresAt: row.expiresAt,
          createdAt: row.createdAt,
        })),
      };
    },
  });

  app.get('/payments/:id', {
    preHandler: [app.requirePermission(Permission.AUTHORIZE_OWN_PAYMENT)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const intent = await prisma.paymentIntent.findFirst({
        where: { id, userId: request.auth!.userId },
        include: { bankAccount: { select: { maskedNumber: true, nickname: true } } },
      });
      if (!intent) throw notFound('Payment');
      return {
        id: intent.id,
        amount: toNumber(intent.amount),
        currency: intent.currency,
        merchant: intent.merchant,
        status: intent.status,
        account: intent.bankAccount,
        // The phrase is only shown while the payment is still awaiting authorisation.
        confirmationPhrase:
          intent.status === 'REQUIRES_CONFIRMATION' ? intent.confirmationPhrase : null,
        expiresAt: intent.expiresAt,
        completedAt: intent.completedAt,
        failureReason: intent.failureReason,
      };
    },
  });
}
