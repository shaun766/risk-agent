import { env } from '../../config/env';
import { MockVoiceProvider } from './mock-provider';
import type { VoiceProvider } from './provider';

let instance: VoiceProvider | null = null;

export function voiceProvider(): VoiceProvider {
  if (instance) return instance;
  // Twilio Voice / WebRTC implementations plug in here without touching callers.
  instance = new MockVoiceProvider();
  return instance;
}

export { MockVoiceProvider };
export * from './provider';
