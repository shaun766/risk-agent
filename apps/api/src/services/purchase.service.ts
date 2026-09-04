import { Prisma, prisma, toDecimal, toNumber, toRateDecimal } from '@flowmoney/database';
import {
  AuditAction,
  ENGINE_VERSION,
  type ConversationChannel,
  type PurchaseDecision,
  type PurchaseRequest,
} from '@flowmoney/shared-types';
import { evaluatePurchase } from '@flowmoney/financial-engine';
import type { FastifyRequest } from 'fastify';
import { recordAudit } from '../lib/audit';
import { getFinancialView, persistSnapshot } from './financial.service';

export interface AnalyzePurchaseInput {
  userId: string;
  request: PurchaseRequest;
  persist?: boolean;
  channel?: ConversationChannel;
  conversationId?: string | null;
  httpRequest?: FastifyRequest;
}

export interface AnalyzePurchaseResult {
  decision: PurchaseDecision;
  decisionId: string | null;
  snapshotId: string | null;
}

/**
 * Runs the deterministic purchase engine and, when persisting, stores the
 * decision together with the exact snapshot it was computed from. That pairing
 * is what makes a past verdict reproducible months later.
 */
export async function analyzePurchase(input: AnalyzePurchaseInput): Promise<AnalyzePurchaseResult> {
  const view = await getFinancialView(input.userId);
  const decision = evaluatePurchase({
    snapshot: view.snapshot,
    internals: view.internals,
    request: input.request,
  });

  if (!input.persist) {
    return { decision, decisionId: null, snapshotId: null };
  }

  const snapshotId = await persistSnapshot(input.userId, view.snapshot);
  const row = await prisma.purchaseDecision.create({
    data: {
      userId: input.userId,
      snapshotId,
      conversationId: input.conversationId ?? null,
      description: input.request.description ?? input.request.merchant ?? 'Purchase',
      merchant: input.request.merchant ?? null,
      categoryKey: input.request.category,
      price: toDecimal(input.request.price),
      isRecurring: Boolean(input.request.isRecurring),
      monthlyCost:
        input.request.monthlyCost != null ? toDecimal(input.request.monthlyCost) : null,
      importance: input.request.importance ?? 3,
      verdict: decision.verdict,
      score: toRateDecimal(decision.score, 2),
      confidence: toRateDecimal(decision.confidence, 2),
      affordabilityGap: toDecimal(decision.affordabilityGap),
      budgetImpactPercentage: toRateDecimal(decision.budgetImpactPercentage, 2),
      primaryReasons: decision.primaryReasons,
      payload: decision as unknown as Prisma.InputJsonValue,
      channel: input.channel ?? 'WEB',
      engineVersion: ENGINE_VERSION,
      factors: {
        create: decision.factors.map((factor) => ({
          key: factor.key,
          label: factor.label,
          score: toRateDecimal(factor.score, 2),
          weight: toRateDecimal(factor.weight, 4),
          contribution: toRateDecimal(factor.contribution, 2),
          detail: factor.detail,
          inputs: factor.inputs as unknown as Prisma.InputJsonValue,
        })),
      },
    },
    select: { id: true },
  });

  await recordAudit({
    userId: input.userId,
    action: AuditAction.PURCHASE_ANALYSIS,
    resource: 'purchase_decision',
    resourceId: row.id,
    channel: input.channel ?? 'WEB',
    metadata: {
      purchasePrice: input.request.price,
      category: input.request.category,
      affordabilityScore: decision.score,
      verdict: decision.verdict,
      snapshotId,
      engineVersion: ENGINE_VERSION,
    },
    request: input.httpRequest,
  });

  return { decision, decisionId: row.id, snapshotId };
}

/** Attaches the LLM's natural-language explanation to a stored decision. */
export async function attachExplanation(decisionId: string, explanation: string): Promise<void> {
  await prisma.purchaseDecision.update({
    where: { id: decisionId },
    data: { explanation },
  });
}

export async function listPurchaseHistory(
  userId: string,
  page: number,
  pageSize: number,
): Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.purchaseDecision.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { factors: true },
    }),
    prisma.purchaseDecision.count({ where: { userId } }),
  ]);

  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      description: row.description,
      merchant: row.merchant,
      categoryKey: row.categoryKey,
      price: toNumber(row.price),
      verdict: row.verdict,
      score: toNumber(row.score),
      confidence: toNumber(row.confidence),
      affordabilityGap: toNumber(row.affordabilityGap),
      budgetImpactPercentage: toNumber(row.budgetImpactPercentage),
      primaryReasons: row.primaryReasons,
      explanation: row.explanation,
      channel: row.channel,
      wasPurchased: row.wasPurchased,
      createdAt: row.createdAt,
      factors: row.factors.map((factor) => ({
        key: factor.key,
        label: factor.label,
        score: toNumber(factor.score),
        weight: toNumber(factor.weight),
        contribution: toNumber(factor.contribution),
        detail: factor.detail,
      })),
    })),
  };
}
