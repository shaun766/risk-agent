import { prisma } from '@flowmoney/database';
import { Permission } from '@flowmoney/shared-types';
import type { FastifyInstance } from 'fastify';
import { env, isProduction } from '../../config/env';
import { forbidden } from '../../lib/errors';
import { handleInboundMessage } from '../../services/whatsapp.service';
import { MockWhatsAppProvider, whatsappProvider } from '../../services/whatsapp';

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // Signature verification needs the exact bytes that were signed, so the raw
  // body is retained for these routes only.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (request, body: Buffer, done) => {
      (request as { rawBody?: Buffer }).rawBody = body;
      try {
        done(null, body.length ? JSON.parse(body.toString('utf8')) : {});
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );

  /** Meta's webhook verification handshake. */
  app.get('/webhooks/whatsapp', async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === env.WHATSAPP_VERIFY_TOKEN
    ) {
      return reply.status(200).type('text/plain').send(query['hub.challenge'] ?? '');
    }
    return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Verification failed' } });
  });

  /**
   * Inbound messages.
   *
   * Always answers 200 quickly once the signature checks out: WhatsApp retries
   * on any non-2xx, and a retry storm during a transient failure would replay
   * every customer's message.
   */
  app.post('/webhooks/whatsapp', {
    config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const provider = whatsappProvider();
      const rawBody = (request as { rawBody?: Buffer }).rawBody ?? Buffer.from('');

      const signatureValid = provider.verifySignature(
        rawBody,
        request.headers as Record<string, unknown>,
      );
      if (!signatureValid) {
        request.log.warn({ provider: provider.key }, 'rejected webhook with invalid signature');
        await prisma.webhookEvent.create({
          data: {
            provider: provider.key,
            eventType: 'signature.invalid',
            externalId: `invalid_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            status: 'FAILED',
            signatureValid: false,
            payload: {},
            error: 'Invalid signature',
          },
        });
        return reply.status(401).send({
          error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' },
        });
      }

      const messages = provider.parseWebhook(request.body);
      if (messages.length === 0) {
        // Status callbacks and other non-message events land here.
        return reply.status(200).send({ received: true, processed: 0 });
      }

      const results = [];
      for (const message of messages) {
        results.push(await handleInboundMessage(message));
      }

      return reply.status(200).send({
        received: true,
        processed: results.length,
        ...(isProduction ? {} : { results }),
      });
    },
  });

  /** Delivery/read receipts. Recorded for observability, never user-facing. */
  app.post('/webhooks/whatsapp/status', async (request, reply) => {
    const body = request.body as { statuses?: Array<{ id: string; status: string }> };
    for (const status of body.statuses ?? []) {
      await prisma.webhookEvent
        .create({
          data: {
            provider: whatsappProvider().key,
            eventType: `status.${status.status}`,
            externalId: `status_${status.id}_${status.status}`,
            status: 'PROCESSED',
            signatureValid: true,
            payload: status as never,
            processedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
    return reply.status(200).send({ received: true });
  });

  /**
   * Local WhatsApp simulator. Only available with the mock provider, so it
   * cannot exist in an environment wired to a real WhatsApp number.
   */
  app.get('/webhooks/whatsapp/outbox', {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const provider = whatsappProvider();
      if (!(provider instanceof MockWhatsAppProvider)) {
        throw forbidden('The outbox is only available with the mock WhatsApp provider');
      }
      return { messages: provider.recentMessages() };
    },
  });

  app.get('/webhooks/events', {
    preHandler: [app.requirePermission(Permission.REPLAY_WEBHOOKS)],
    handler: async () => {
      const events = await prisma.webhookEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return { events };
    },
  });
}
