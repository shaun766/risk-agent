import { GLOBAL_SYSTEM_PROMPT, type StructuredAIResponse } from '@flowmoney/shared-types';
import OpenAI from 'openai';
import type { ToolDefinition } from './tools';

export interface LLMConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export interface LLMTurn {
  content: string | null;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  promptTokens: number | null;
  completionTokens: number | null;
}

let client: OpenAI | null = null;
let clientKey = '';

function getClient(config: LLMConfig): OpenAI {
  if (!client || clientKey !== config.apiKey) {
    client = new OpenAI({ apiKey: config.apiKey, timeout: config.timeoutMs, maxRetries: 2 });
    clientKey = config.apiKey;
  }
  return client;
}

export function buildSystemPrompt(agentInstructions: string, context: {
  userName: string;
  currency: string;
  today: string;
  channel: string;
}): string {
  return [
    GLOBAL_SYSTEM_PROMPT,
    '',
    '--- AGENT ROLE ---',
    agentInstructions,
    '',
    '--- SESSION CONTEXT ---',
    `User: ${context.userName}`,
    `Currency: ${context.currency}`,
    `Today: ${context.today}`,
    `Channel: ${context.channel}`,
  ].join('\n');
}

/** Safely parse the model's tool arguments — malformed JSON must not crash a turn. */
function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function chatCompletion(
  config: LLMConfig,
  messages: LLMMessage[],
  tools: ToolDefinition[],
  options: { temperature: number; maxTokens: number },
): Promise<LLMTurn> {
  const openai = getClient(config);

  const response = await openai.chat.completions.create({
    model: config.model,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    ...(tools.length > 0
      ? {
          tools: tools.map((tool) => ({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
          tool_choice: 'auto' as const,
        }
      : {}),
  });

  const choice = response.choices[0];
  const message = choice?.message;

  return {
    content: message?.content ?? null,
    toolCalls:
      message?.tool_calls?.map((call) => ({
        id: call.id,
        name: call.function.name,
        args: parseArgs(call.function.arguments),
      })) ?? [],
    promptTokens: response.usage?.prompt_tokens ?? null,
    completionTokens: response.usage?.completion_tokens ?? null,
  };
}

const STRUCTURED_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    recommendation: { type: 'string' },
    reasons: { type: 'array', items: { type: 'string' } },
    nextActions: { type: 'array', items: { type: 'string' } },
    riskLevel: { type: 'string', enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] },
  },
  required: ['summary', 'recommendation', 'reasons', 'nextActions', 'riskLevel'],
  additionalProperties: false,
} as const;

/**
 * Second pass that turns the narrative into the structured envelope the UI
 * renders. Kept separate from the main turn so a schema failure degrades to the
 * deterministic structure rather than losing the answer.
 */
export async function structureResponse(
  config: LLMConfig,
  narrative: string,
  toolSummary: string,
): Promise<StructuredAIResponse | null> {
  try {
    const openai = getClient(config);
    const response = await openai.chat.completions.create({
      model: config.model,
      temperature: 0,
      max_tokens: 600,
      messages: [
        {
          role: 'system',
          content:
            'Convert the assistant answer into the required JSON structure. Copy figures exactly as written; never invent or round them differently.',
        },
        { role: 'user', content: `ANSWER:\n${narrative}\n\nTOOL DATA:\n${toolSummary}` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'financial_response', strict: true, schema: STRUCTURED_SCHEMA },
      },
    });
    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;
    return JSON.parse(raw) as StructuredAIResponse;
  } catch {
    return null;
  }
}
