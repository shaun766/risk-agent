/**
 * @flowmoney/financial-engine
 *
 * Pure, deterministic financial computation. No I/O, no database, no LLM.
 * Given the same EngineContext it always produces the same numbers, which is
 * what makes every AI explanation reproducible and every decision auditable.
 */
export * from './period';
export * from './aggregate';
export * from './snapshot';
export * from './health';
export * from './purchase';
export * from './budget';
export * from './idle-cash';
export * from './anomalies';
export * from './insights';
export * from './report';
