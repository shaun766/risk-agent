/**
 * Banking provider abstraction.
 *
 * Everything above this interface is provider-agnostic. Swapping the mock for a
 * real aggregator (Plaid, Salt Edge, an account-aggregator framework) means
 * implementing this interface and changing one environment variable — no
 * business logic moves.
 */
export interface ProviderAccount {
  externalId: string;
  maskedNumber: string;
  nickname: string;
  type: 'SAVINGS' | 'CURRENT' | 'CREDIT_CARD' | 'LOAN' | 'FIXED_DEPOSIT' | 'WALLET';
  currency: string;
  currentBalance: number;
  availableBalance: number;
  creditLimit: number | null;
  isLiability: boolean;
}

export interface ProviderBalance {
  externalId: string;
  currentBalance: number;
  availableBalance: number;
  asOf: string;
}

export interface ProviderTransaction {
  externalId: string;
  accountExternalId: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  currency: string;
  description: string;
  merchantName: string | null;
  categoryHint: string | null;
  occurredAt: string;
  status: 'PENDING' | 'POSTED' | 'FAILED' | 'REVERSED';
}

export interface ProviderPaymentRequest {
  accountExternalId: string;
  amount: number;
  currency: string;
  merchant: string;
  description: string;
  idempotencyKey: string;
}

export interface ProviderPaymentResult {
  providerRef: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  failureReason?: string;
  settledAt?: string;
}

export interface TransactionQueryOptions {
  from?: Date;
  to?: Date;
  accountExternalId?: string;
  limit?: number;
}

export interface BankingProvider {
  readonly key: string;
  getAccounts(userId: string): Promise<ProviderAccount[]>;
  getBalances(userId: string): Promise<ProviderBalance[]>;
  getTransactions(userId: string, options?: TransactionQueryOptions): Promise<ProviderTransaction[]>;
  initiatePayment(userId: string, request: ProviderPaymentRequest): Promise<ProviderPaymentResult>;
  getPaymentStatus(providerRef: string): Promise<ProviderPaymentResult>;
}
