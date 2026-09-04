import { randomUUID } from 'node:crypto';
import { notFound } from '../../lib/errors';
import type { AudioTurn, CallSession, VoiceProvider } from './provider';

/**
 * MockVoiceProvider — an in-memory call transport.
 *
 * Real enough to exercise the full pipeline (session lifecycle, inbound audio
 * turns, outbound replies) without a telephony account. Tests and the local
 * demo push audio in with `pushInboundAudio` and read replies from `responses`.
 */
export class MockVoiceProvider implements VoiceProvider {
  readonly key = 'mock';

  private readonly sessions = new Map<string, CallSession>();
  private readonly inbound = new Map<string, AudioTurn[]>();
  private readonly outbound = new Map<string, Array<{ audio: Buffer; mimeType: string }>>();

  async startCall(input: { to: string; from: string; userId?: string | null }): Promise<CallSession> {
    const session: CallSession = {
      callId: randomUUID(),
      userId: input.userId ?? null,
      from: input.from,
      to: input.to,
      startedAt: new Date().toISOString(),
      status: 'ACTIVE',
    };
    this.sessions.set(session.callId, session);
    this.inbound.set(session.callId, []);
    this.outbound.set(session.callId, []);
    return session;
  }

  pushInboundAudio(callId: string, audio: Buffer, mimeType = 'audio/ogg', isFinal = true): void {
    const queue = this.inbound.get(callId);
    if (!queue) throw notFound('Call');
    queue.push({ callId, audio, mimeType, sequence: queue.length, isFinal });
  }

  async *receiveAudioStream(callId: string): AsyncIterable<AudioTurn> {
    const queue = this.inbound.get(callId);
    if (!queue) throw notFound('Call');
    while (queue.length > 0) {
      const turn = queue.shift();
      if (turn) yield turn;
    }
  }

  async sendAudioResponse(callId: string, audio: Buffer, mimeType: string): Promise<void> {
    const queue = this.outbound.get(callId);
    if (!queue) throw notFound('Call');
    queue.push({ audio, mimeType });
  }

  async endCall(callId: string): Promise<CallSession> {
    const session = this.sessions.get(callId);
    if (!session) throw notFound('Call');
    session.status = 'ENDED';
    return session;
  }

  responses(callId: string): Array<{ audio: Buffer; mimeType: string }> {
    return this.outbound.get(callId) ?? [];
  }
}
