import { Prisma, prisma, toNumber } from '@flowmoney/database';
import {
  Permission,
  createTransactionSchema,
  transactionQuerySchema,
  transactionSummaryQuerySchema,
  uuid,
} from '@flowmoney/shared-types';
import { monthKeyOf, parseMonthKey } from '@flowmoney/financial-engine';
import type { FastifyInstance } from 'fastify';
import { paginate, skipTake } from '../../lib/pagination';
import { deleteTransaction, logManualTransaction } from '../../services/transaction.service';

export async function transactionRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Manual entry — the same primitive the WhatsApp "spent 500 on lunch" flow
   * uses under the hood, just reached via a form instead of a message.
   */
  app.post('/transactions', {
    preHandler: [app.requirePermission(Permission.MANAGE_OWN_TRANSACTIONS)],
    handler: async (request, reply) => {
      const input = createTransactionSchema.parse(request.body);
      const result = await logManualTransaction(request.auth!.userId, input, 'WEB');
      return reply.status(201).send(result);
    },
  });

  app.delete('/transactions/:id', {
    preHandler: [app.requirePermission(Permission.MANAGE_OWN_TRANSACTIONS)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      return deleteTransaction(request.auth!.userId, id, 'WEB');
    },
  });

  app.get('/transactions', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_TRANSACTIONS)],
    handler: async (request) => {
      const query = transactionQuerySchema.parse(request.query ?? {});
      const userId = request.auth!.userId;

      const where: Prisma.TransactionWhereInput = {
        userId,
        ...(query.accountId ? { bankAccountId: query.accountId } : {}),
        ...(query.categoryKey ? { category: { key: query.categoryKey } } : {}),
        ...(query.direction
          ? { direction: query.direction as Prisma.TransactionWhereInput['direction'] }
          : {}),
        ...(query.from || query.to
          ? {
              occurredAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
        ...(query.minAmount !== undefined || query.maxAmount !== undefined
          ? {
              amount: {
                ...(query.minAmount !== undefined ? { gte: query.minAmount } : {}),
                ...(query.maxAmount !== undefined ? { lte: query.maxAmount } : {}),
              },
            }
          : {}),
        ...(query.search
          ? {
              OR: [
                { description: { contains: query.search, mode: 'insensitive' } },
                { merchant: { displayName: { contains: query.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      };

      const [rows, total] = await Promise.all([
        prisma.transaction.findMany({
          where,
          include: { category: true, merchant: true, bankAccount: true },
          orderBy: { occurredAt: 'desc' },
          ...skipTake(query.page, query.pageSize),
        }),
        prisma.transaction.count({ where }),
      ]);

      return paginate(
        rows.map((txn) => ({
          id: txn.id,
          amount: toNumber(txn.amount),
          direction: txn.direction,
          status: txn.status,
          description: txn.description,
          merchant: txn.merchant?.displayName ?? null,
          category: {
            key: txn.category.key,
            label: txn.category.label,
            kind: txn.category.kind,
            colour: txn.category.colour,
            icon: txn.category.icon,
          },
          account: { id: txn.bankAccount.id, nickname: txn.bankAccount.nickname },
          occurredAt: txn.occurredAt,
          isRecurring: txn.isRecurring,
        })),
        total,
        query.page,
        query.pageSize,
      );
    },
  });

  app.get('/transactions/summary', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_TRANSACTIONS)],
    handler: async (request) => {
      const query = transactionSummaryQuerySchema.parse(request.query ?? {});
      const userId = request.auth!.userId;
      const month = query.month ?? monthKeyOf(new Date());
      const start = parseMonthKey(month);
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59, 999));

      const rows = await prisma.transaction.findMany({
        where: { userId, occurredAt: { gte: start, lte: end }, status: 'POSTED' },
        include: { category: true, merchant: true },
      });

      const buckets = new Map<string, { key: string; label: string; colour: string; amount: number; count: number }>();
      let totalIn = 0;
      let totalOut = 0;

      for (const txn of rows) {
        const amount = toNumber(txn.amount);
        if (txn.direction === 'CREDIT') totalIn += amount;
        else totalOut += amount;
        if (txn.direction !== 'DEBIT') continue;

        const key =
          query.groupBy === 'merchant'
            ? (txn.merchant?.displayName ?? txn.description)
            : query.groupBy === 'day'
              ? txn.occurredAt.toISOString().slice(0, 10)
              : query.groupBy === 'week'
                ? `W${Math.ceil(txn.occurredAt.getUTCDate() / 7)}`
                : txn.category.key;

        const label =
          query.groupBy === 'category' ? txn.category.label : key;
        const colour = query.groupBy === 'category' ? txn.category.colour : '#6366f1';

        const bucket = buckets.get(key) ?? { key, label, colour, amount: 0, count: 0 };
        bucket.amount += amount;
        bucket.count += 1;
        buckets.set(key, bucket);
      }

      return {
        month,
        groupBy: query.groupBy,
        totalIn: Math.round(totalIn * 100) / 100,
        totalOut: Math.round(totalOut * 100) / 100,
        net: Math.round((totalIn - totalOut) * 100) / 100,
        transactionCount: rows.length,
        groups: [...buckets.values()]
          .map((b) => ({ ...b, amount: Math.round(b.amount * 100) / 100 }))
          .sort((a, b) =>
            query.groupBy === 'day' || query.groupBy === 'week'
              ? a.key.localeCompare(b.key)
              : b.amount - a.amount,
          ),
      };
    },
  });

  app.get('/transactions/categories', {
    preHandler: [app.authenticate],
    handler: async () => {
      const categories = await prisma.transactionCategory.findMany({ orderBy: { label: 'asc' } });
      return {
        categories: categories.map((c) => ({
          key: c.key,
          label: c.label,
          kind: c.kind,
          icon: c.icon,
          colour: c.colour,
        })),
      };
    },
  });
}
