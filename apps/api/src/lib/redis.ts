import Redis from 'ioredis';
import { env } from '../config/env';

/**
 * Redis is used for queues and short-lived caches. It is treated as optional:
 * if it is unreachable the API degrades to computing on demand rather than
 * refusing to serve, which keeps local development frictionless.
 */
let client: Redis | null = null;
let unavailableLogged = false;

export function getRedis(): Redis | null {
  if (client) return client;
  try {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => (attempt > 5 ? null : Math.min(attempt * 200, 2000)),
    });
    client.on('error', (error) => {
      if (!unavailableLogged) {
        unavailableLogged = true;
        // eslint-disable-next-line no-console
        console.warn(`[redis] unavailable (${error.message}) — running without cache/queues`);
      }
    });
    return client;
  } catch {
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready') return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready') return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    /* cache writes are best-effort */
  }
}

export async function cacheInvalidate(pattern: string): Promise<void> {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready') return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch {
    /* best-effort */
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
  }
}
