import { bankingProvider } from '../banking';
import type { CreatePaymentInput, PaymentProvider, PaymentResult } from './provider';

/**
 * MockPaymentProvider settles against the simulated bank, so a completed
 * payment genuinely reduces the account balance the financial engine then reads.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly key = 'mock';

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const result = await bankingProvider().initiatePayment(input.userId, {
      accountExternalId: input.accountExternalId,
      amount: input.amount,
      currency: input.currency,
      merchant: input.merchant,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
    });
    return result;
  }

  async confirmPayment(providerRef: string): Promise<PaymentResult> {
    return bankingProvider().getPaymentStatus(providerRef);
  }

  async getPaymentStatus(providerRef: string): Promise<PaymentResult> {
    return bankingProvider().getPaymentStatus(providerRef);
  }
}
