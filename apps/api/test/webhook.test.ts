import { closeApp, disconnectDb, getApp } from './helpers';
import { prisma } from '@flowmoney/database';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The WhatsApp webhook is the primary interface per the product spec: a
 * message in produces the same orchestrator run (intent → agent → tools →
 * reply) as the web chat, over the mock provider so no real WhatsApp account
 * is needed. `WHATSAPP_PROVIDER=mock` is the default (see .env.example).
 */
afterAll(async () => {
  await closeApp();
  await disconnectDb();
});

describe('WhatsApp webhook (mock provider)', () => {
  it('rejects a webhook verification handshake with the wrong token', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123',
    });
    expect(response.statusCode).toBe(403);
  });

  it('confirms a webhook verification handshake with the correct token', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=flowmoney_verify_token&hub.challenge=echo-123',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('echo-123');
  });

  it('processes an inbound purchase-analysis question from a known customer end to end', async () => {
    const app = await getApp();
    const shaun = await prisma.user.findUniqueOrThrow({ where: { email: 'shaun@flowmoney.dev' } });
    expect(shaun.phone).toBeTruthy();

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: { from: shaun.phone, text: 'Can I buy a PS5 for 50000?', profileName: 'Shaun', messageId: `test-${Date.now()}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { processed: number; results: Array<{ status: string; userId: string; reply: string }> };
    expect(body.processed).toBe(1);
    expect(body.results[0].status).toBe('PROCESSED');
    expect(body.results[0].userId).toBe(shaun.id);
    // The numbers in the reply come from the deterministic engine, not the LLM.
    expect(body.results[0].reply).toMatch(/NOT RECOMMENDED|WAIT AND SAVE|CAUTION/i);
    expect(body.results[0].reply).toContain('50,000');
  });

  it('records an unrecognised phone number without crashing', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: { from: '+919999999999', text: 'Hello', messageId: `unknown-${Date.now()}` },
    });
    expect(response.statusCode).toBe(200);
  });

  it('rejects a status-callback payload silently (no message to process)', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp/status',
      payload: { statuses: [{ id: `wamid.test-${Date.now()}`, status: 'delivered' }] },
    });
    expect(response.statusCode).toBe(200);
  });
});
