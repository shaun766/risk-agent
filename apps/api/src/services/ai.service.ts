import { Prisma, prisma, toNumber } from '@flowmoney/database';
import {
  runOrchestrator,
  type AgentConfig,
  type OrchestratorResult,
} from '@flowmoney/ai-agents';
import { AuditAction, type ConversationChannel } from '@flowmoney/shared-types';
import { env, hasOpenAI } from '../config/env';
import { recordAudit } from '../lib/audit';
import { attachExplanation } from './purchase.service';
import { toolRuntime } from './tool-runtime';

const HISTORY_LIMIT = 12;

/** Agents are loaded from the database on every turn so admin edits apply immediately. */
export async function loadAgents(): Promise<AgentConfig[]> {
  const rows = await prisma.aIAgent.findMany({
    where: { isEnabled: true },
    include: { toolPermissions: { where: { isEnabled: true } } },
    orderBy: { priority: 'asc' },
  });

  return rows.map((agent) => ({
    id: agent.id,
    key: agent.key,
    name: agent.name,
    systemInstructions: agent.systemInstructions,
    allowedTools: agent.toolPermissions.map((permission) => permission.toolName),
    handledIntents: (agent.handledIntents as string[] | null) ?? [],
    requiredPermissions: (agent.requiredPermissions as string[] | null) ?? [],
    outputFormat: agent.outputFormat,
    temperature: toNumber(agent.temperature, 0.3),
    maxTokens: agent.maxTokens,
    model: agent.model,
    priority: agent.priority,
    isEnabled: agent.isEnabled,
    restrictedToRoleId: agent.restrictedToRoleId,
  }));
}

export interface ConversationTurnInput {
  userId: string;
  fullName: string;
  permissions: string[];
  message: string;
  channel: ConversationChannel;
  conversationId?: string | null;
  agentKey?: string | null;
  externalRef?: string | null;
  currency?: string;
}

export interface ConversationTurnResult extends OrchestratorResult {
  conversationId: string;
  messageId: string;
}

async function resolveConversation(input: ConversationTurnInput): Promise<string> {
  if (input.conversationId) {
    const existing = await prisma.aIConversation.findFirst({
      where: { id: input.conversationId, userId: input.userId },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  // WhatsApp threads are keyed by the sender's wa_id so a returning user
  // continues the same conversation rather than starting a new one each message.
  if (input.externalRef) {
    const byRef = await prisma.aIConversation.findFirst({
      where: { userId: input.userId, externalRef: input.externalRef, isArchived: false },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });
    if (byRef) return byRef.id;
  }

  const created = await prisma.aIConversation.create({
    data: {
      userId: input.userId,
      channel: input.channel,
      externalRef: input.externalRef ?? null,
      title: input.message.slice(0, 80),
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * One end-to-end conversational turn: route, run tools, generate a reply, and
 * persist the entire trace.
 *
 * The trace is not decoration — it is what lets a bank answer "why did the
 * system tell this customer to wait?" months later, with the intent, the agent,
 * the tools called and the exact figures they returned.
 */
export async function runConversationTurn(
  input: ConversationTurnInput,
): Promise<ConversationTurnResult> {
  const conversationId = await resolveConversation(input);

  const history = await prisma.aIMessage.findMany({
    where: { conversationId, role: { in: ['USER', 'ASSISTANT'] } },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
    select: { role: true, content: true },
  });

  const userMessage = await prisma.aIMessage.create({
    data: { conversationId, role: 'USER', content: input.message },
    select: { id: true },
  });

  const agents = await loadAgents();
  const result = await runOrchestrator(
    {
      user: {
        userId: input.userId,
        fullName: input.fullName,
        permissions: input.permissions,
        currency: input.currency ?? 'INR',
      },
      message: input.message,
      channel: input.channel,
      conversationId,
      history: history
        .reverse()
        .map((message) => ({ role: message.role as 'USER' | 'ASSISTANT', content: message.content })),
      agentKey: input.agentKey ?? null,
      runtime: toolRuntime,
      agents,
    },
    {
      llm: hasOpenAI
        ? {
            apiKey: env.OPENAI_API_KEY,
            model: env.OPENAI_MODEL,
            timeoutMs: env.OPENAI_TIMEOUT_MS,
          }
        : null,
    },
  );

  await prisma.aIMessage.update({
    where: { id: userMessage.id },
    data: { intent: result.intent, intentConfidence: result.intentConfidence },
  });

  const assistantMessage = await prisma.aIMessage.create({
    data: {
      conversationId,
      agentId: result.agentId,
      role: 'ASSISTANT',
      content: result.text,
      intent: result.intent,
      toolCalls: result.invocations.map((invocation) => ({
        name: invocation.name,
        args: invocation.args,
        ok: invocation.ok,
        durationMs: invocation.durationMs,
        ...(invocation.error ? { error: invocation.error } : {}),
      })) as unknown as Prisma.InputJsonValue,
      structured: (result.structured ?? undefined) as unknown as Prisma.InputJsonValue,
      model: result.model,
      usedLLM: result.usedLLM,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      latencyMs: result.latencyMs,
    },
    select: { id: true },
  });

  await prisma.aIConversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), agentId: result.agentId ?? undefined },
  });

  // Store the narrative alongside the decision it explains.
  if (result.purchaseDecisionId) {
    await attachExplanation(result.purchaseDecisionId, result.text);
    await prisma.purchaseDecision.update({
      where: { id: result.purchaseDecisionId },
      data: { conversationId },
    });
  }

  await recordAudit({
    userId: input.userId,
    action: AuditAction.AI_CONVERSATION_TURN,
    resource: 'ai_conversation',
    resourceId: conversationId,
    channel: input.channel,
    metadata: {
      intent: result.intent,
      intentConfidence: result.intentConfidence,
      agentKey: result.agentKey,
      toolsUsed: result.invocations.map((invocation) => invocation.name),
      usedLLM: result.usedLLM,
      model: result.model,
      latencyMs: result.latencyMs,
      purchaseDecisionId: result.purchaseDecisionId,
    },
  });

  return { ...result, conversationId, messageId: assistantMessage.id };
}
