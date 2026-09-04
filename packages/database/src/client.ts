import { Prisma, PrismaClient } from '@prisma/client';

/**
 * A single PrismaClient per process. Next.js dev and tsx watch mode both reload
 * modules, so the instance is cached on globalThis to avoid exhausting the
 * Postgres connection pool with a new client per reload.
 */
const globalForPrisma = globalThis as unknown as { __flowmoneyPrisma?: PrismaClient };

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.PRISMA_LOG === 'query'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.__flowmoneyPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__flowmoneyPrisma = prisma;
}

export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export { Prisma, PrismaClient };
export type { Prisma as PrismaTypes };
