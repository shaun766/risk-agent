import { Prisma, prisma } from '@flowmoney/database';
import type { FastifyRequest } from 'fastify';

export interface AuditInput {
  userId?: string | null;
  subjectId?: string | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  channel?: string;
  metadata?: Record<string, unknown>;
  request?: FastifyRequest;
}

/**
 * Append-only audit trail.
 *
 * Writing an audit row must never break the operation it is recording, so
 * failures are logged and swallowed. Anything security-critical is additionally
 * enforced in code, not merely audited.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        subjectId: input.subjectId ?? null,
        action: input.action,
        resource: input.resource ?? null,
        resourceId: input.resourceId ?? null,
        channel: input.channel ?? 'API',
        ipAddress: input.request?.ip ?? null,
        userAgent: input.request?.headers['user-agent'] ?? null,
        requestId: input.request?.id ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    input.request?.log?.warn({ err: error, action: input.action }, 'failed to write audit log');
  }
}
