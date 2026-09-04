import { env } from '../../config/env';
import { MockBankingProvider } from './mock-provider';
import type { BankingProvider } from './provider';

let instance: BankingProvider | null = null;

/**
 * Provider factory. Adding a real aggregator means adding a case here; nothing
 * else in the codebase imports a concrete provider.
 */
export function bankingProvider(): BankingProvider {
  if (instance) return instance;
  switch (env.BANKING_PROVIDER) {
    case 'mock':
    default:
      instance = new MockBankingProvider();
      return instance;
  }
}

export * from './provider';
