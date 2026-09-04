import { prisma, toNullableNumber, toNumber } from '@flowmoney/database';
import { Permission, uuid } from '@flowmoney/shared-types';
import type { FastifyInstance } from 'fastify';
import { notFound } from '../../lib/errors';
import { bankingProvider } from '../../services/banking';
import { invalidateFinancialCache } from '../../services/financial.service';

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get('/accounts', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_ACCOUNTS)],
    handler: async (request) => {
      const accounts = await prisma.bankAccount.findMany({
        where: { userId: request.auth!.userId, status: { not: 'CLOSED' } },
        include: { bank: true },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });

      return {
        accounts: accounts.map((account) => ({
          id: account.id,
          bank: { id: account.bank.id, name: account.bank.name, code: account.bank.code },
          maskedNumber: account.maskedNumber,
          nickname: account.nickname,
          type: account.type,
          status: account.status,
          currency: account.currency,
          currentBalance: toNumber(account.currentBalance),
          availableBalance: toNumber(account.availableBalance),
          creditLimit: toNullableNumber(account.creditLimit),
          isLiability: account.isLiability,
          isPrimary: account.isPrimary,
          isEmergencyFund: account.isEmergencyFund,
          lastSyncedAt: account.lastSyncedAt,
        })),
      };
    },
  });

  app.get('/accounts/:id', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_ACCOUNTS)],
    handler: async (request) => {
      const { id } = { id: uuid.parse((request.params as { id: string }).id) };
      const account = await prisma.bankAccount.findFirst({
        where: { id, userId: request.auth!.userId },
        include: {
          bank: true,
          balances: { orderBy: { recordedAt: 'asc' }, take: 90 },
        },
      });
      if (!account) throw notFound('Account');

      const recent = await prisma.transaction.findMany({
        where: { bankAccountId: account.id },
        include: { category: true, merchant: true },
        orderBy: { occurredAt: 'desc' },
        take: 20,
      });

      return {
        id: account.id,
        bank: { id: account.bank.id, name: account.bank.name, code: account.bank.code },
        maskedNumber: account.maskedNumber,
        nickname: account.nickname,
        type: account.type,
        status: account.status,
        currency: account.currency,
        currentBalance: toNumber(account.currentBalance),
        availableBalance: toNumber(account.availableBalance),
        creditLimit: toNullableNumber(account.creditLimit),
        isLiability: account.isLiability,
        isPrimary: account.isPrimary,
        isEmergencyFund: account.isEmergencyFund,
        balanceHistory: account.balances.map((row) => ({
          date: row.recordedAt.toISOString().slice(0, 10),
          balance: toNumber(row.balance),
          available: toNumber(row.available),
        })),
        recentTransactions: recent.map((txn) => ({
          id: txn.id,
          amount: toNumber(txn.amount),
          direction: txn.direction,
          description: txn.description,
          merchant: txn.merchant?.displayName ?? null,
          category: { key: txn.category.key, label: txn.category.label, colour: txn.category.colour },
          occurredAt: txn.occurredAt,
        })),
      };
    },
  });

  /**
   * Pulls fresh balances from the banking provider. With the mock provider this
   * is a no-op reconciliation; with a real aggregator it is the sync entry point.
   */
  app.post('/accounts/sync', {
    preHandler: [app.requirePermission(Permission.LINK_BANK_ACCOUNT)],
    handler: async (request) => {
      const userId = request.auth!.userId;
      const balances = await bankingProvider().getBalances(userId);

      for (const balance of balances) {
        await prisma.bankAccount.updateMany({
          where: { userId, externalId: balance.externalId },
          data: {
            currentBalance: balance.currentBalance,
            availableBalance: balance.availableBalance,
            lastSyncedAt: new Date(),
          },
        });
      }
      await invalidateFinancialCache(userId);
      return { synced: balances.length, syncedAt: new Date().toISOString() };
    },
  });
}
