// Must run before `../src/config/env` (see env-overrides.ts for why a plain
// statement here wouldn't work).
import './env-overrides';

// Must run before `@flowmoney/database` is imported anywhere in the test
// process: that package constructs its PrismaClient singleton at module load
// time, reading DATABASE_URL from process.env at that instant. Under
// Vitest/Vite's SSR module execution, sibling imports run in true
// declaration order (unlike Node's CJS require caching), so this side-effect
// import of the API's env loader has to come first or Prisma freezes an
// empty datasource URL before dotenv ever runs.
import '../src/config/env';
import { prisma } from '@flowmoney/database';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server';

/**
 * Integration tests run against a real Postgres (the same one `pnpm dev`
 * uses) via Fastify's `inject()`, which drives the full plugin/route stack
 * without opening a socket. There is no separate test database: the seed
 * script's fixtures are read-only from these tests' point of view, and every
 * test creates its own throwaway user via `/auth/register` rather than
 * mutating seeded accounts, so runs are repeatable and don't collide.
 */

let app: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildServer();
    await app.ready();
  }
  return app;
}

export async function closeApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@flowmoney.test`;
}

export interface TestSession {
  accessToken: string;
  userId: string;
  email: string;
}

/** Registers a throwaway CUSTOMER account and returns a bearer token for it. */
export async function registerTestUser(
  overrides: { monthlyIncome?: number; fullName?: string } = {},
): Promise<TestSession> {
  const server = await getApp();
  const email = uniqueEmail('test-user');
  const response = await server.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email,
      password: 'TestPassword123',
      fullName: overrides.fullName ?? 'Test User',
      monthlyIncome: overrides.monthlyIncome,
    },
  });
  if (response.statusCode !== 201) {
    throw new Error(`registerTestUser failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json() as { accessToken: string; user: { id: string } };
  return { accessToken: body.accessToken, userId: body.user.id, email };
}

/** Logs in as one of the seeded demo accounts (see packages/database/prisma/seed.ts). */
export async function loginAs(email: string, password = 'Password123!'): Promise<TestSession> {
  const server = await getApp();
  const response = await server.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(`loginAs(${email}) failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json() as { accessToken: string; user: { id: string } };
  return { accessToken: body.accessToken, userId: body.user.id, email };
}

export function authHeader(session: TestSession): { authorization: string } {
  return { authorization: `Bearer ${session.accessToken}` };
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
