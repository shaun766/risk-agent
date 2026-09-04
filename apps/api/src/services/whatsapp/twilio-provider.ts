import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';
import { serviceUnavailable } from '../../lib/errors';
import { normalisePhone } from './meta-provider';
import type { InboundMessage, OutboundButton, SendResult, WhatsAppProvider } from './provider';

/**
 * Twilio WhatsApp.
 *
 * Twilio posts form-encoded webhooks and signs them with a URL + sorted-params
 * HMAC, which is why signature verification here looks nothing like Meta's.
 */
export class TwilioWhatsAppProvider implements WhatsAppProvider {
  readonly key = 'twilio';

  verifySignature(rawBody: Buffer | string, headers: Record<string, unknown>): boolean {
    const signature = String(headers['x-twilio-signature'] ?? '');
    if (!signature || !env.TWILIO_AUTH_TOKEN) return false;

    const url = String(headers['x-forwarded-url'] ?? headers['x-original-url'] ?? '');
    if (!url) return false;

    const params = new URLSearchParams(
      typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'),
    );
    const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const payload = url + sorted.map(([key, value]) => key + value).join('');

    const expected = createHmac('sha1', env.TWILIO_AUTH_TOKEN).update(payload).digest('base64');
    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  parseWebhook(payload: unknown): InboundMessage[] {
    const body = payload as Record<string, string>;
    if (!body.From || !body.MessageSid) return [];

    const hasAudio = Number(body.NumMedia ?? '0') > 0 && (body.MediaContentType0 ?? '').startsWith('audio');

    return [
      {
        externalId: body.MessageSid,
        from: normalisePhone(body.From.replace('whatsapp:', '')),
        to: normalisePhone((body.To ?? '').replace('whatsapp:', '')),
        type: hasAudio ? 'audio' : 'text',
        text: body.Body ?? null,
        mediaId: hasAudio ? (body.MediaUrl0 ?? null) : null,
        mediaMimeType: body.MediaContentType0 ?? null,
        timestamp: new Date().toISOString(),
        profileName: body.ProfileName ?? null,
        raw: body,
      },
    ];
  }

  private async send(params: Record<string, string>): Promise<SendResult> {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      throw serviceUnavailable('Twilio is not configured');
    }
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: env.TWILIO_WHATSAPP_FROM, ...params }),
      },
    );
    const json = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!response.ok) {
      return { externalId: '', status: 'FAILED', error: json.message ?? `HTTP ${response.status}` };
    }
    return { externalId: json.sid ?? '', status: 'SENT' };
  }

  async sendText(to: string, body: string): Promise<SendResult> {
    return this.send({ To: `whatsapp:${to}`, Body: body.slice(0, 1600) });
  }

  /** Twilio has no native reply buttons on WhatsApp — fall back to a numbered list. */
  async sendButtons(to: string, body: string, buttons: OutboundButton[]): Promise<SendResult> {
    const suffix = buttons.map((button, index) => `${index + 1}. ${button.title}`).join('\n');
    return this.sendText(to, `${body}\n\nReply with:\n${suffix}`);
  }

  async sendAudio(): Promise<SendResult> {
    // Twilio requires a publicly reachable MediaUrl; wire object storage in
    // before enabling voice replies on this provider.
    return { externalId: '', status: 'FAILED', error: 'Audio replies require public media hosting' };
  }

  async sendImage(): Promise<SendResult> {
    // Same constraint as sendAudio: Twilio needs a public MediaUrl, not raw
    // bytes. Wire object storage (STORAGE_DRIVER=s3) and upload the chart
    // there first before enabling chart images on this provider.
    return { externalId: '', status: 'FAILED', error: 'Image replies require public media hosting' };
  }

  async downloadMedia(mediaUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const response = await fetch(mediaUrl, {
      headers: {
        authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      },
    });
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type') ?? 'audio/ogg',
    };
  }
}
