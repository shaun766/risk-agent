/**
 * Payment provider abstraction.
 *
 * Deliberately separate from the banking provider: reading a ledger and moving
 * money are different trust boundaries, and only this interface is allowed to
 * do the latter.
 */
export interface CreatePaymentInput {
  userId: string;
  accountExternalId: string;
  amount: number;
  currency: string;
  merchant: string;
  description: string;
  idempotencyKey: string;
}

export interface PaymentResult {
  providerRef: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  failureReason?: string;
  settledAt?: string;
}

export interface PaymentProvider {
  readonly key: string;
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;
  confirmPayment(providerRef: string): Promise<PaymentResult>;
  getPaymentStatus(providerRef: string): Promise<PaymentResult>;
}
