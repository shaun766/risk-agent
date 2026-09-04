import { Prisma, prisma, toDecimal, toNumber } from '@flowmoney/database';
import { AuditAction, categoryLabel, type CreateTransactionInput } from '@flowmoney/shared-types';
import { badRequest, notFound } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import { invalidateFinancialCache } from './financial.service';

export interface LoggedTransactionResult {
  id: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  categoryKey: string;
  categoryLabel: string;
  description: string;
  occurredAt: string;
  accountMasked: string;
  balanceAfter: number;
}

/**
 * Manual transaction entry — the same primitive whether it arrives from the
 * web form or a WhatsApp message like "spent 500 on lunch". Unlike a payment
 * intent, this never authorises new spend: it records something the user says
 * already happened, so there is no confirmation-phrase step and no
 * insufficient-funds guard — the balance is adjusted to match reality, even if
 * that takes it negative (a real account can go negative too).
 */
export async function logManualTransaction(
  userId: string,
  input: CreateTransactionInput,
  channel: string = 'WEB',
): Promise<LoggedTransactionResult> {
  const category = await prisma.transactionCategory.findUnique({ where: { key: input.categoryKey } });
  const resolvedCategory =
    category ?? (await prisma.transactionCategory.findUnique({ where: { key: 'other' } }));
  if (!resolvedCategory) throw badRequest(`Unknown category "${input.categoryKey}"`);

  const account = input.accountId
    ? await prisma.bankAccount.findFirst({ where: { id: input.accountId, userId, status: { not: 'CLOSED' } } })
    : await prisma.bankAccount.findFirst({
        where: { userId, status: { not: 'CLOSED' }, isLiability: false },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });
  if (!account) throw notFound('A spendable account to log this against');

  const description =
    input.description + (input.merchant ? ` — ${input.merchant}` : '');
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const signedAmount = input.direction === 'CREDIT' ? input.amount : -input.amount;

  const { transaction, updatedAccount } = await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        userId,
        bankAccountId: account.id,
        categoryId: resolvedCategory.id,
        amount: toDecimal(input.amount),
        direction: input.direction as Prisma.TransactionCreateInput['direction'],
        status: 'POSTED',
        currency: account.currency,
        description: description.slice(0, 400),
        occurredAt,
        postedAt: new Date(),
        isRecurring: input.isRecurring,
        metadata: { source: 'MANUAL', channel },
      },
    });
    const updated = await tx.bankAccount.update({
      where: { id: account.id },
      data: {
        currentBalance: { increment: signedAmount },
        availableBalance: { increment: signedAmount },
      },
    });
    return { transaction: created, updatedAccount: updated };
  });

  await invalidateFinancialCache(userId);
  await recordAudit({
    userId,
    action: AuditAction.TRANSACTION_LOGGED,
    resource: 'transaction',
    resourceId: transaction.id,
    channel,
    metadata: { amount: input.amount, direction: input.direction, categoryKey: resolvedCategory.key },
  });

  return {
    id: transaction.id,
    amount: input.amount,
    direction: input.direction as 'CREDIT' | 'DEBIT',
    categoryKey: resolvedCategory.key,
    categoryLabel: categoryLabel(resolvedCategory.key) || resolvedCategory.label,
    description: transaction.description,
    occurredAt: transaction.occurredAt.toISOString(),
    accountMasked: updatedAccount.maskedNumber,
    balanceAfter: toNumber(updatedAccount.currentBalance),
  };
}

export interface DeletedTransactionResult {
  id: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  description: string;
  balanceAfter: number;
}

/**
 * Deletes a transaction and reverses its effect on the account balance — the
 * exact inverse of logManualTransaction's increment. Scoped to the caller's
 * own transactions regardless of source (a manual entry or an imported one):
 * correcting a duplicate or erroneous row is a normal thing to want from your
 * own transaction history, the same as any budgeting app allows.
 */
export async function deleteTransaction(
  userId: string,
  transactionId: string,
  channel: string = 'WEB',
): Promise<DeletedTransactionResult> {
  const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, userId } });
  if (!transaction) throw notFound('Transaction');

  const amount = toNumber(transaction.amount);
  const signedReversal = transaction.direction === 'CREDIT' ? -amount : amount;

  const updatedAccount = await prisma.$transaction(async (tx) => {
    await tx.transaction.delete({ where: { id: transaction.id } });
    return tx.bankAccount.update({
      where: { id: transaction.bankAccountId },
      data: {
        currentBalance: { increment: signedReversal },
        availableBalance: { increment: signedReversal },
      },
    });
  });

  await invalidateFinancialCache(userId);
  await recordAudit({
    userId,
    action: AuditAction.TRANSACTION_DELETED,
    resource: 'transaction',
    resourceId: transaction.id,
    channel,
    metadata: { amount, direction: transaction.direction, description: transaction.description },
  });

  return {
    id: transaction.id,
    amount,
    direction: transaction.direction as 'CREDIT' | 'DEBIT',
    description: transaction.description,
    balanceAfter: toNumber(updatedAccount.currentBalance),
  };
}
