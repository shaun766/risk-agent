/**
 * @flowmoney/ai-agents
 *
 * Agent orchestration: intent routing, database-configured agents, permission
 * gated tools, and both an LLM-backed and a deterministic response path.
 *
 * This package never talks to a database directly — the host application
 * supplies a `ToolRuntime`, which is the complete set of things agents can do.
 */
export * from './types';
export * from './intent';
export * from './tools';
export * from './orchestrator';
export * from './llm';
export * as renderer from './renderer';
