import { prisma, toDecimal, toNumber } from '@flowmoney/database';
import { AuditAction, type ConversationChannel } from '@flowmoney/shared-types';
import { randomInt } from 'node:crypto';
import { recordAudit } from '../lib/audit';
import { newId, safeEqual } from '../lib/crypto';
import { badRequest, conflict, notFound } from '../lib/errors';
import { paymentProvider } from './payments';
import { invalidateFinancialCache } from './financial.service';

const INTENT_TTL_MINUTES = 15;

export interface CreateIntentInput {
  userId: string;
  amount: number;
  accountId?: string;
  merchant: string;
  description?: string;
  categoryKey?: string;
  purchaseDecisionId?: string | null;
}

/**
 * Creates a payment intent. This is the *only* thing an AI agent can do with
 * money: it prepares a payment and returns a phrase the user must send back
 * themselves. No code path anywhere completes a payment without that step.
 */
export async function createPaymentIntent(input: CreateIntentInput) {
  if (input.amount <= 0) throw badRequest('Payment amount must be greater than zero');

  const account = input.accountId
    ? await prisma.bankAccount.findFirst({
        where: { id: input.accountId, userId: input.userId, status: 'ACTIVE' },
      })
    : await prisma.bankAccount.findFirst({
        where: { userId: input.userId, status: 'ACTIVE', isLiability: false },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });

  if (!account) throw notFound('Account');

  // A short numeric phrase the user types back. Random per intent so a phrase
  // cannot be reused or guessed from a previous conversation.
  const confirmationPhrase = `CONFIRM ${randomInt(1000, 9999)}`;
  const expiresAt = new Date(Date.now() + INTENT_TTL_MINUTES * 60_000);

  const intent = await prisma.paymentIntent.create({
    data: {
      userId: input.userId,
      bankAccountId: account.id,
      purchaseDecisionId: input.purchaseDecisionId ?? null,
      amount: toDecimal(input.amount),
      currency: account.currency,
      merchant: input.merchant,
      description: input.description ?? '',
      categoryKey: input.categoryKey ?? 'shopping',
      status: 'REQUIRES_CONFIRMATION',
      confirmationPhrase,
      providerKey: paymentProvider().key,
      expiresAt,
    },
  });

  await recordAudit({
    userId: input.userId,
    action: AuditAction.PAYMENT_INTENT_CREATED,
    resource: 'payment_intent',
    resourceId: intent.id,
    metadata: { amount: input.amount, merchant: input.merchant, accountId: account.id },
  });

  return {
    paymentIntentId: intent.id,
    amount: toNumber(intent.amount),
    currency: intent.currency,
    merchant: intent.merchant,
    description: intent.description,
    accountId: account.id,
    accountMasked: account.maskedNumber,
    accountNickname: account.nickname,
    availableBalance: toNumber(account.availableBalance),
    confirmationPhrase,
    expiresAt: expiresAt.toISOString(),
    status: intent.status,
    requiresExplicitUserConfirmation: true as const,
  };
}

/**
 * Executes a payment, but only against an exact confirmation phrase supplied by
 * the user. Every failure mode leaves the intent in a terminal state so a
 * retried confirmation can never double-spend.
 */
export async function confirmPaymentIntent(
  userId: string,
  intentId: string,
  phrase: string,
  channel: ConversationChannel = 'WEB',
) {
  const intent = await prisma.paymentIntent.findFirst({
    where: { id: intentId, userId },
    include: { bankAccount: true },
  });
  if (!intent) throw notFound('Payment intent');

  if (intent.status === 'SUCCEEDED') {
    throw conflict('This payment has already been completed');
  }
  if (intent.status !== 'REQUIRES_CONFIRMATION') {
    throw conflict(`Payment cannot be confirmed while it is ${intent.status}`);
  }
  if (intent.expiresAt.getTime() < Date.now()) {
    await prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: 'EXPIRED' } });
    throw conflict('This payment request has expired. Please start again.');
  }
  if (!safeEqual(phrase.trim().toUpperCase(), intent.confirmationPhrase.toUpperCase())) {
    throw badRequest('Confirmation phrase does not match. Payment not executed.');
  }

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: 'PROCESSING', authorizedAt: new Date(), authorizedVia: channel },
  });

  await recordAudit({
    userId,
    action: AuditAction.PAYMENT_AUTHORIZED,
    resource: 'payment_intent',
    resourceId: intent.id,
    channel,
    metadata: { amount: toNumber(intent.amount), merchant: intent.merchant },
  });

  const amount = toNumber(intent.amount);
  const result = await paymentProvider().createPayment({
    userId,
    accountExternalId: intent.bankAccount.externalId,
    amount,
    currency: intent.currency,
    merchant: intent.merchant,
    description: intent.description,
    idempotencyKey: intent.id,
  });

  if (result.status !== 'SUCCEEDED') {
    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: 'FAILED',
        providerRef: result.providerRef,
        failureReason: result.failureReason ?? 'Payment declined by provider',
      },
    });
    return {
      status: 'FAILED' as const,
      paymentIntentId: intent.id,
      failureReason: result.failureReason ?? 'Payment declined by provider',
    };
  }

  const category = await prisma.transactionCategory.findUnique({
    where: { key: intent.categoryKey },
  });
  const fallbackCategory =
    category ?? (await prisma.transactionCategory.findUniqueOrThrow({ where: { key: 'other' } }));

  const transaction = await prisma.transaction.create({
    data: {
      userId,
      bankAccountId: intent.bankAccountId,
      categoryId: fallbackCategory.id,
      externalId: `pay_${intent.id}`,
      amount: toDecimal(amount),
      direction: 'DEBIT',
      status: 'POSTED',
      currency: intent.currency,
      description: intent.description || `Payment to ${intent.merchant}`,
      occurredAt: new Date(),
      postedAt: new Date(),
      paymentIntentId: intent.id,
    },
    select: { id: true },
  });

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: 'SUCCEEDED', providerRef: result.providerRef, completedAt: new Date() },
  });

  if (intent.purchaseDecisionId) {
    await prisma.purchaseDecision.update({
      where: { id: intent.purchaseDecisionId },
      data: { wasPurchased: true },
    });
  }

  await prisma.notification.create({
    data: {
      userId,
      type: 'PAYMENT_STATUS',
      channel: 'IN_APP',
      title: 'Payment completed',
      body: `${intent.currency} ${amount.toLocaleString('en-IN')} paid to ${intent.merchant}.`,
      data: { paymentIntentId: intent.id, transactionId: transaction.id },
      sentAt: new Date(),
    },
  });

  await invalidateFinancialCache(userId);
  await recordAudit({
    userId,
    action: AuditAction.PAYMENT_EXECUTED,
    resource: 'payment_intent',
    resourceId: intent.id,
    channel,
    metadata: { amount, merchant: intent.merchant, transactionId: transaction.id },
  });

  return {
    status: 'SUCCEEDED' as const,
    paymentIntentId: intent.id,
    transactionId: transaction.id,
    amount,
    merchant: intent.merchant,
    completedAt: new Date().toISOString(),
  };
}

export async function cancelPaymentIntent(userId: string, intentId: string) {
  const intent = await prisma.paymentIntent.findFirst({ where: { id: intentId, userId } });
  if (!intent) throw notFound('Payment intent');
  if (intent.status !== 'REQUIRES_CONFIRMATION') {
    throw conflict(`Payment cannot be cancelled while it is ${intent.status}`);
  }
  await prisma.paymentIntent.update({ where: { id: intentId }, data: { status: 'CANCELLED' } });
  return { ok: true };
}

/** The most recent intent still awaiting confirmation — used by "proceed" on WhatsApp. */
export async function pendingIntentFor(userId: string) {
  return prisma.paymentIntent.findFirst({
    where: { userId, status: 'REQUIRES_CONFIRMATION', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    include: { bankAccount: true },
  });
}

export { newId };
