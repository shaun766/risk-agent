/**
 * Voice call abstraction.
 *
 * Deliberately transport-agnostic so business logic never couples to Twilio
 * Voice, a WhatsApp calling API or a WebRTC gateway. A voice call is modelled
 * as: a session, a stream of inbound audio turns, and outbound audio replies —
 * all of which reuse the same agent orchestrator as text.
 */
export interface CallSession {
  callId: string;
  userId: string | null;
  from: string;
  to: string;
  startedAt: string;
  status: 'RINGING' | 'ACTIVE' | 'ENDED' | 'FAILED';
}

export interface AudioTurn {
  callId: string;
  audio: Buffer;
  mimeType: string;
  sequence: number;
  isFinal: boolean;
}

export interface VoiceProvider {
  readonly key: string;
  startCall(input: { to: string; from: string; userId?: string | null }): Promise<CallSession>;
  /** Yields inbound audio turns as the caller speaks. */
  receiveAudioStream(callId: string): AsyncIterable<AudioTurn>;
  sendAudioResponse(callId: string, audio: Buffer, mimeType: string): Promise<void>;
  endCall(callId: string): Promise<CallSession>;
}
