/**
 * WhatsApp provider abstraction.
 *
 * The business logic never knows whether messages travel over Meta's Cloud API,
 * Twilio, or a local mock. Adding a provider means implementing this interface.
 */
export interface InboundMessage {
  /** Provider-side message id, used for idempotent processing. */
  externalId: string;
  /** Sender's phone number in E.164, without the "whatsapp:" prefix. */
  from: string;
  /** Recipient (the business number). */
  to: string;
  type: 'text' | 'audio' | 'interactive' | 'image' | 'document' | 'unsupported';
  text: string | null;
  mediaId: string | null;
  mediaMimeType: string | null;
  timestamp: string;
  profileName: string | null;
  raw: unknown;
}

export interface OutboundButton {
  id: string;
  title: string;
}

export interface SendResult {
  externalId: string;
  status: 'SENT' | 'QUEUED' | 'FAILED';
  error?: string;
}

export interface WhatsAppProvider {
  readonly key: string;
  /** Verifies the webhook signature. Returns false for anything unverifiable. */
  verifySignature(rawBody: Buffer | string, headers: Record<string, unknown>): boolean;
  /** Normalises a provider-specific webhook payload into InboundMessage[]. */
  parseWebhook(payload: unknown): InboundMessage[];
  sendText(to: string, body: string): Promise<SendResult>;
  sendButtons(to: string, body: string, buttons: OutboundButton[]): Promise<SendResult>;
  sendAudio(to: string, audio: Buffer, mimeType: string): Promise<SendResult>;
  downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }>;
}
