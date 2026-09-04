import { randomUUID } from 'node:crypto';
import { normalisePhone } from './meta-provider';
import type { InboundMessage, OutboundButton, SendResult, WhatsAppProvider } from './provider';

export interface MockSentMessage {
  to: string;
  body: string;
  buttons?: OutboundButton[];
  /** For kind 'image': a data URL, so the chart can actually be previewed from the outbox. */
  imageDataUrl?: string;
  kind: 'text' | 'buttons' | 'audio' | 'image';
  sentAt: string;
}

/**
 * MockWhatsAppProvider — a fully functional local WhatsApp.
 *
 * Outbound messages are captured in memory and exposed through
 * /webhooks/whatsapp/outbox, so the entire WhatsApp experience can be driven
 * and inspected end to end without a Meta account. Inbound payloads use the
 * same shape as the real providers.
 */
export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly key = 'mock';
  private readonly outbox: MockSentMessage[] = [];

  /** The mock accepts any payload — it is only ever reachable in development. */
  verifySignature(): boolean {
    return true;
  }

  parseWebhook(payload: unknown): InboundMessage[] {
    const body = payload as {
      from?: string;
      text?: string;
      type?: string;
      mediaId?: string;
      mediaMimeType?: string;
      profileName?: string;
      messageId?: string;
    };
    if (!body.from) return [];

    return [
      {
        externalId: body.messageId ?? randomUUID(),
        from: normalisePhone(body.from),
        to: '+10000000000',
        type: (body.type as InboundMessage['type']) ?? 'text',
        text: body.text ?? null,
        mediaId: body.mediaId ?? null,
        mediaMimeType: body.mediaMimeType ?? null,
        timestamp: new Date().toISOString(),
        profileName: body.profileName ?? null,
        raw: body,
      },
    ];
  }

  async sendText(to: string, body: string): Promise<SendResult> {
    this.outbox.push({ to, body, kind: 'text', sentAt: new Date().toISOString() });
    return { externalId: randomUUID(), status: 'SENT' };
  }

  async sendButtons(to: string, body: string, buttons: OutboundButton[]): Promise<SendResult> {
    this.outbox.push({ to, body, buttons, kind: 'buttons', sentAt: new Date().toISOString() });
    return { externalId: randomUUID(), status: 'SENT' };
  }

  async sendAudio(to: string, audio: Buffer): Promise<SendResult> {
    this.outbox.push({
      to,
      body: `[audio reply · ${audio.length} bytes]`,
      kind: 'audio',
      sentAt: new Date().toISOString(),
    });
    return { externalId: randomUUID(), status: 'SENT' };
  }

  async sendImage(to: string, image: Buffer, caption?: string): Promise<SendResult> {
    this.outbox.push({
      to,
      body: caption ?? '',
      kind: 'image',
      imageDataUrl: `data:image/png;base64,${image.toString('base64')}`,
      sentAt: new Date().toISOString(),
    });
    return { externalId: randomUUID(), status: 'SENT' };
  }

  async downloadMedia(): Promise<{ buffer: Buffer; mimeType: string }> {
    return { buffer: Buffer.alloc(0), mimeType: 'audio/ogg' };
  }

  recentMessages(limit = 50): MockSentMessage[] {
    return this.outbox.slice(-limit).reverse();
  }

  clear(): void {
    this.outbox.length = 0;
  }
}
