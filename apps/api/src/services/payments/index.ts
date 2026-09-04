import { env } from '../../config/env';
import { MockPaymentProvider } from './mock-provider';
import type { PaymentProvider } from './provider';

let instance: PaymentProvider | null = null;

export function paymentProvider(): PaymentProvider {
  if (instance) return instance;
  switch (env.PAYMENT_PROVIDER) {
    case 'mock':
    default:
      instance = new MockPaymentProvider();
      return instance;
  }
}

export * from './provider';
