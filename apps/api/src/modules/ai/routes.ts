import { prisma } from '@flowmoney/database';
import { Permission, aiChatSchema, paginationSchema, uuid } from '@flowmoney/shared-types';
import type { FastifyInstance } from 'fastify';
import { notFound } from '../../lib/errors';
import { paginate, skipTake } from '../../lib/pagination';
import { runConversationTurn, loadAgents } from '../../services/ai.service';

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The single entry point used by both the dashboard and WhatsApp. Same
   * orchestrator, same tools, same engine — only the channel differs.
   */
  app.post('/ai/chat', {
    preHandler: [app.requirePermission(Permission.USE_AI_CHAT)],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    handler: async (request) => {
      const input = aiChatSchema.parse(request.body);
      const auth = request.auth!;

      const result = await runConversationTurn({
        userId: auth.userId,
        fullName: auth.fullName,
        permissions: auth.permissions,
        message: input.message,
        channel: input.channel as 'WEB',
        conversationId: input.conversationId ?? null,
        agentKey: input.agentKey ?? null,
      });

      return {
        conversationId: result.conversationId,
        messageId: result.messageId,
        reply: result.text,
        structured: result.structured,
        quickActions: result.quickActions,
        purchaseDecisionId: result.purchaseDecisionId,
        trace: {
          intent: result.intent,
          intentConfidence: result.intentConfidence,
          agentKey: result.agentKey,
          usedLLM: result.usedLLM,
          model: result.model,
          latencyMs: result.latencyMs,
          toolsUsed: result.invocations.map((invocation) => ({
            name: invocation.name,
            durationMs: invocation.durationMs,
            ok: invocation.ok,
          })),
        },
      };
    },
  });

  app.get('/ai/conversations', {
    preHandler: [app.requirePermission(Permission.USE_AI_CHAT)],
    handler: async (request) => {
      const { page, pageSize } = paginationSchema.parse(request.query ?? {});
      const where = { userId: request.auth!.userId, isArchived: false };

      const [rows, total] = await Promise.all([
        prisma.aIConversation.findMany({
          where,
          orderBy: { lastMessageAt: 'desc' },
          include: {
            agent: { select: { key: true, name: true } },
            _count: { select: { messages: true } },
          },
          ...skipTake(page, pageSize),
        }),
        prisma.aIConversation.count({ where }),
      ]);

      return paginate(
        rows.map((conversation) => ({
          id: conversation.id,
          title: conversation.title,
          channel: conversation.channel,
          agent: conversation.agent,
          messageCount: conversation._count.messages,
          lastMessageAt: conversation.lastMessageAt,
          createdAt: conversation.createdAt,
        })),
        total,
        page,
        pageSize,
      );
    },
  });

  app.get('/ai/conversations/:id', {
    preHandler: [app.requirePermission(Permission.USE_AI_CHAT)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const conversation = await prisma.aIConversation.findFirst({
        where: { id, userId: request.auth!.userId },
        include: {
          agent: { select: { key: true, name: true } },
          messages: { orderBy: { createdAt: 'asc' } },
        },
      });
      if (!conversation) throw notFound('Conversation');

      return {
        id: conversation.id,
        title: conversation.title,
        channel: conversation.channel,
        agent: conversation.agent,
        createdAt: conversation.createdAt,
        messages: conversation.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          intent: message.intent,
          structured: message.structured,
          toolCalls: message.toolCalls,
          usedLLM: message.usedLLM,
          model: message.model,
          latencyMs: message.latencyMs,
          createdAt: message.createdAt,
        })),
      };
    },
  });

  /** Agents the current user is actually allowed to talk to. */
  app.get('/ai/agents', {
    preHandler: [app.requirePermission(Permission.USE_AI_CHAT)],
    handler: async (request) => {
      const auth = request.auth!;
      const agents = await loadAgents();
      return {
        agents: agents
          .filter((agent) =>
            agent.requiredPermissions.every((permission) => auth.permissions.includes(permission)),
          )
          .map((agent) => ({
            key: agent.key,
            name: agent.name,
            handledIntents: agent.handledIntents,
            allowedTools: agent.allowedTools,
            outputFormat: agent.outputFormat,
          })),
      };
    },
  });
}
