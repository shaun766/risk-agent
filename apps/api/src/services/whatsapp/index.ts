import { env } from '../../config/env';
import { MetaWhatsAppProvider } from './meta-provider';
import { MockWhatsAppProvider } from './mock-provider';
import { TwilioWhatsAppProvider } from './twilio-provider';
import type { WhatsAppProvider } from './provider';

let instance: WhatsAppProvider | null = null;

export function whatsappProvider(): WhatsAppProvider {
  if (instance) return instance;
  switch (env.WHATSAPP_PROVIDER) {
    case 'meta':
      instance = new MetaWhatsAppProvider();
      break;
    case 'twilio':
      instance = new TwilioWhatsAppProvider();
      break;
    default:
      instance = new MockWhatsAppProvider();
  }
  return instance;
}

export { MockWhatsAppProvider };
export * from './provider';
