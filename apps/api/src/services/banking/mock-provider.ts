import { prisma, toNullableNumber, toNumber } from '@flowmoney/database';
import { AppError, notFound } from '../../lib/errors';
import type {
  BankingProvider,
  ProviderAccount,
  ProviderBalance,
  ProviderPaymentRequest,
  ProviderPaymentResult,
  ProviderTransaction,
  TransactionQueryOptions,
} from './provider';

/**
 * MockBankingProvider — a simulated bank backed by the platform's own database.
 *
 * This is a real implementation of the interface, not a stub: balances move,
 * ledgers stay consistent, and a payment either settles and debits the account
 * or fails atomically. It is labelled "mock" only because the money is not real.
 */
export class MockBankingProvider implements BankingProvider {
  readonly key = 'mock';

  /** Deterministic idempotency: the same key never debits twice. */
  private readonly settled = new Map<string, ProviderPaymentResult>();

  async getAccounts(userId: string): Promise<ProviderAccount[]> {
    const accounts = await prisma.bankAccount.findMany({
      where: { userId, status: { not: 'CLOSED' } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return accounts.map((account) => ({
      externalId: account.externalId,
      maskedNumber: account.maskedNumber,
      nickname: account.nickname ?? account.type,
      type: account.type,
      currency: account.currency,
      currentBalance: toNumber(account.currentBalance),
      availableBalance: toNumber(account.availableBalance),
      creditLimit: toNullableNumber(account.creditLimit),
      isLiability: account.isLiability,
    }));
  }

  async getBalances(userId: string): Promise<ProviderBalance[]> {
    const accounts = await prisma.bankAccount.findMany({
      where: { userId, status: { not: 'CLOSED' } },
    });
    const asOf = new Date().toISOString();
    return accounts.map((account) => ({
      externalId: account.externalId,
      currentBalance: toNumber(account.currentBalance),
      availableBalance: toNumber(account.availableBalance),
      asOf,
    }));
  }

  async getTransactions(
    userId: string,
    options: TransactionQueryOptions = {},
  ): Promise<ProviderTransaction[]> {
    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        ...(options.from || options.to
          ? { occurredAt: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } }
          : {}),
        ...(options.accountExternalId
          ? { bankAccount: { externalId: options.accountExternalId } }
          : {}),
      },
      include: { bankAccount: true, merchant: true, category: true },
      orderBy: { occurredAt: 'desc' },
      take: options.limit ?? 500,
    });

    return transactions.map((txn) => ({
      externalId: txn.externalId ?? txn.id,
      accountExternalId: txn.bankAccount.externalId,
      amount: toNumber(txn.amount),
      direction: txn.direction,
      currency: txn.currency,
      description: txn.description,
      merchantName: txn.merchant?.displayName ?? null,
      categoryHint: txn.category.key,
      occurredAt: txn.occurredAt.toISOString(),
      status: txn.status,
    }));
  }

  async initiatePayment(
    userId: string,
    request: ProviderPaymentRequest,
  ): Promise<ProviderPaymentResult> {
    const existing = this.settled.get(request.idempotencyKey);
    if (existing) return existing;

    const account = await prisma.bankAccount.findFirst({
      where: { userId, externalId: request.accountExternalId },
    });
    if (!account) throw notFound('Account');

    const available = toNumber(account.availableBalance);
    if (request.amount > available) {
      const result: ProviderPaymentResult = {
        providerRef: `mock_pay_${request.idempotencyKey}`,
        status: 'FAILED',
        failureReason: `Insufficient funds: available ${available}, requested ${request.amount}`,
      };
      this.settled.set(request.idempotencyKey, result);
      return result;
    }

    // Debit and settle atomically — a partial write here would corrupt the
    // ledger the entire engine reads from.
    await prisma.$transaction(async (tx) => {
      await tx.bankAccount.update({
        where: { id: account.id },
        data: {
          currentBalance: { decrement: request.amount },
          availableBalance: { decrement: request.amount },
          lastSyncedAt: new Date(),
        },
      });
      await tx.accountBalance.upsert({
        where: {
          bankAccountId_recordedAt: {
            bankAccountId: account.id,
            recordedAt: startOfDay(new Date()),
          },
        },
        create: {
          bankAccountId: account.id,
          balance: toNumber(account.currentBalance) - request.amount,
          available: available - request.amount,
          recordedAt: startOfDay(new Date()),
        },
        update: {
          balance: toNumber(account.currentBalance) - request.amount,
          available: available - request.amount,
        },
      });
    });

    const result: ProviderPaymentResult = {
      providerRef: `mock_pay_${request.idempotencyKey}`,
      status: 'SUCCEEDED',
      settledAt: new Date().toISOString(),
    };
    this.settled.set(request.idempotencyKey, result);
    return result;
  }

  async getPaymentStatus(providerRef: string): Promise<ProviderPaymentResult> {
    for (const result of this.settled.values()) {
      if (result.providerRef === providerRef) return result;
    }
    const intent = await prisma.paymentIntent.findFirst({ where: { providerRef } });
    if (!intent) throw new AppError(404, 'NOT_FOUND', `Unknown payment reference ${providerRef}`);
    return {
      providerRef,
      status:
        intent.status === 'SUCCEEDED'
          ? 'SUCCEEDED'
          : intent.status === 'FAILED'
            ? 'FAILED'
            : intent.status === 'PROCESSING'
              ? 'PROCESSING'
              : 'PENDING',
      ...(intent.failureReason ? { failureReason: intent.failureReason } : {}),
    };
  }
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 0, 0));
}
