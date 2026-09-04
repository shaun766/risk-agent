import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, closeApp, disconnectDb, getApp, loginAs, type TestSession } from './helpers';

/**
 * Exercises the deterministic purchase decision engine through the real HTTP
 * route, against `shaun@flowmoney.dev` — the seeded reference scenario from
 * the product spec (₹75k income, ₹62k balance, ₹12k discretionary budget,
 * ₹54k emergency fund). A ₹50,000 PS5 should be firmly rejected; a small,
 * clearly-affordable purchase should not be.
 */
let shaun: TestSession;

beforeAll(async () => {
  shaun = await loginAs('shaun@flowmoney.dev');
});

afterAll(async () => {
  await closeApp();
  await disconnectDb();
});

describe('purchase decision engine', () => {
  it('flags a purchase far beyond the discretionary budget as NOT_RECOMMENDED', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/purchase/analyze',
      headers: authHeader(shaun),
      payload: { price: 50_000, category: 'shopping', merchant: 'Test PS5 Store', persist: false },
    });

    expect(response.statusCode).toBe(200);
    const decision = response.json() as {
      verdict: string;
      score: number;
      purchasePrice: number;
      primaryReasons: string[];
      factors: Array<{ key: string; score: number; weight: number }>;
      opportunityCost: { futureValue: number };
    };

    expect(decision.verdict).toBe('NOT_RECOMMENDED');
    expect(decision.score).toBeLessThan(40);
    expect(decision.purchasePrice).toBe(50_000);
    expect(decision.primaryReasons.length).toBeGreaterThan(0);
    expect(decision.factors).toHaveLength(7);
    // The engine, not an LLM, computed this — weights must sum to 1.
    const totalWeight = decision.factors.reduce((sum, f) => sum + f.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 5);
    expect(decision.opportunityCost.futureValue).toBeGreaterThan(50_000);
  });

  it('is more favourable to a small purchase than a large one, all else equal', async () => {
    const app = await getApp();
    const small = await app.inject({
      method: 'POST',
      url: '/purchase/analyze',
      headers: authHeader(shaun),
      payload: { price: 500, category: 'dining', persist: false },
    });
    const large = await app.inject({
      method: 'POST',
      url: '/purchase/analyze',
      headers: authHeader(shaun),
      payload: { price: 50_000, category: 'shopping', persist: false },
    });

    expect(small.statusCode).toBe(200);
    expect(large.statusCode).toBe(200);
    expect(small.json().score).toBeGreaterThan(large.json().score);
  });

  it('rejects an invalid payload with a validation error and never reaches the engine', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/purchase/analyze',
      headers: authHeader(shaun),
      payload: { price: -100, category: 'shopping' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('persists a decision and makes it retrievable from purchase history', async () => {
    const app = await getApp();
    const analyze = await app.inject({
      method: 'POST',
      url: '/purchase/analyze',
      headers: authHeader(shaun),
      payload: { price: 12_345, category: 'entertainment', merchant: 'Integration Test Merchant', persist: true },
    });
    expect(analyze.statusCode).toBe(200);
    const { decisionId } = analyze.json() as { decisionId: string };
    expect(decisionId).toBeTruthy();

    const history = await app.inject({
      method: 'GET',
      url: '/purchase/history?pageSize=5',
      headers: authHeader(shaun),
    });
    expect(history.statusCode).toBe(200);
    const { items } = history.json() as { items: Array<{ id: string; merchant: string | null }> };
    expect(items.some((row) => row.id === decisionId)).toBe(true);

    const detail = await app.inject({
      method: 'GET',
      url: `/purchase/${decisionId}`,
      headers: authHeader(shaun),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().merchant).toBe('Integration Test Merchant');
  });

  it('refuses to analyze a purchase without an access token', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/purchase/analyze',
      payload: { price: 1000, category: 'shopping' },
    });
    expect(response.statusCode).toBe(401);
  });
});
