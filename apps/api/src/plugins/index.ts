import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { corsOrigins, env, isProduction } from '../config/env';
import { getRedis } from '../lib/redis';
import { authPlugin } from './auth';

export async function registerPlugins(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: isProduction ? undefined : false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      // Same-origin and server-to-server requests carry no Origin header.
      if (!origin || corsOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} is not allowed`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await app.register(cookie, {
    secret: env.COOKIE_SECRET,
    hook: 'onRequest',
  });

  const redis = getRedis();
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    // Falls back to in-process counting when Redis is unavailable.
    redis: redis && redis.status === 'ready' ? redis : undefined,
    keyGenerator: (request) => request.auth?.userId ?? request.ip,
    allowList: (request) => request.url === '/health',
  });

  await app.register(authPlugin);
}
