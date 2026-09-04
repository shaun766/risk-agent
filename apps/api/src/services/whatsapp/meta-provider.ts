import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';
import { serviceUnavailable } from '../../lib/errors';
import type {
  InboundMessage,
  OutboundButton,
  SendResult,
  WhatsAppProvider,
} from './provider';

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          audio?: { id: string; mime_type: string };
          image?: { id: string; mime_type: string };
          document?: { id: string; mime_type: string };
          interactive?: {
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string };
          };
        }>;
      };
    }>;
  }>;
}

/**
 * WhatsApp Business Cloud API (Meta).
 *
 * Signature verification is mandatory: without it, anyone who learns the
 * webhook URL could impersonate a customer and drive their financial assistant.
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly key = 'meta';

  private get baseUrl(): string {
    return `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}`;
  }

  verifySignature(rawBody: Buffer | string, headers: Record<string, unknown>): boolean {
    const signature = String(headers['x-hub-signature-256'] ?? '');
    if (!signature.startsWith('sha256=') || !env.WHATSAPP_APP_SECRET) return false;

    const expected = createHmac('sha256', env.WHATSAPP_APP_SECRET)
      .update(typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody)
      .digest('hex');
    const provided = signature.slice(7);
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  }

  parseWebhook(payload: unknown): InboundMessage[] {
    const body = payload as MetaWebhookPayload;
    const messages: InboundMessage[] = [];

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const businessNumber = value?.metadata?.display_phone_number ?? '';
        const profileName = value?.contacts?.[0]?.profile?.name ?? null;

        for (const message of value?.messages ?? []) {
          const interactiveText =
            message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? null;

          messages.push({
            externalId: message.id,
            from: normalisePhone(message.from),
            to: businessNumber,
            type:
              message.type === 'text'
                ? 'text'
                : message.type === 'audio'
                  ? 'audio'
                  : message.type === 'interactive'
                    ? 'interactive'
                    : message.type === 'image'
                      ? 'image'
                      : message.type === 'document'
                        ? 'document'
                        : 'unsupported',
            text: message.text?.body ?? interactiveText,
            mediaId: message.audio?.id ?? message.image?.id ?? message.document?.id ?? null,
            mediaMimeType:
              message.audio?.mime_type ?? message.image?.mime_type ?? message.document?.mime_type ?? null,
            timestamp: new Date(Number(message.timestamp) * 1000).toISOString(),
            profileName,
            raw: message,
          });
        }
      }
    }

    return messages;
  }

  private async post(path: string, body: unknown): Promise<SendResult> {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      throw serviceUnavailable('WhatsApp is not configured (missing token or phone number id)');
    }
    const response = await fetch(`${this.baseUrl}/${env.WHATSAPP_PHONE_NUMBER_ID}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = (await response.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return { externalId: '', status: 'FAILED', error: json.error?.message ?? `HTTP ${response.status}` };
    }
    return { externalId: json.messages?.[0]?.id ?? '', status: 'SENT' };
  }

  async sendText(to: string, body: string): Promise<SendResult> {
    return this.post('/messages', {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { preview_url: false, body: body.slice(0, 4096) },
    });
  }

  async sendButtons(to: string, body: string, buttons: OutboundButton[]): Promise<SendResult> {
    return this.post('/messages', {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body.slice(0, 1024) },
        action: {
          buttons: buttons.slice(0, 3).map((button) => ({
            type: 'reply',
            reply: { id: button.id, title: button.title.slice(0, 20) },
          })),
        },
      },
    });
  }

  async sendAudio(to: string, audio: Buffer, mimeType: string): Promise<SendResult> {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      throw serviceUnavailable('WhatsApp is not configured');
    }
    // Media must be uploaded first, then referenced by id.
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), 'reply.ogg');

    const upload = await fetch(`${this.baseUrl}/${env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
      body: form,
    });
    const uploaded = (await upload.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!upload.ok || !uploaded.id) {
      return { externalId: '', status: 'FAILED', error: uploaded.error?.message ?? 'media upload failed' };
    }

    return this.post('/messages', {
      messaging_product: 'whatsapp',
      to,
      type: 'audio',
      audio: { id: uploaded.id },
    });
  }

  async sendImage(to: string, image: Buffer, caption?: string): Promise<SendResult> {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      throw serviceUnavailable('WhatsApp is not configured');
    }
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'image/png');
    form.append('file', new Blob([new Uint8Array(image)], { type: 'image/png' }), 'chart.png');

    const upload = await fetch(`${this.baseUrl}/${env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
      body: form,
    });
    const uploaded = (await upload.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!upload.ok || !uploaded.id) {
      return { externalId: '', status: 'FAILED', error: uploaded.error?.message ?? 'media upload failed' };
    }

    return this.post('/messages', {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { id: uploaded.id, ...(caption ? { caption: caption.slice(0, 1024) } : {}) },
    });
  }

  async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    if (!env.WHATSAPP_ACCESS_TOKEN) throw serviceUnavailable('WhatsApp is not configured');

    const metaResponse = await fetch(`${this.baseUrl}/${mediaId}`, {
      headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
    });
    const meta = (await metaResponse.json()) as { url?: string; mime_type?: string };
    if (!meta.url) throw serviceUnavailable('Media URL unavailable');

    const fileResponse = await fetch(meta.url, {
      headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
    });
    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    return { buffer, mimeType: meta.mime_type ?? 'audio/ogg' };
  }
}

export function normalisePhone(value: string): string {
  const digits = value.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}
