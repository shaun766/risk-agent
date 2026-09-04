import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { Permission } from '@flowmoney/shared-types';
import { recordAudit } from '../lib/audit';
import { forbidden, unauthorized } from '../lib/errors';
import { loadUserAccess, type UserAccess } from '../modules/auth/rbac';
import { verifyAccessToken } from '../modules/auth/tokens';

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by `authenticate`; absent on public routes. */
    auth?: UserAccess;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (
      ...permissions: string[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAnyPermission: (
      ...permissions: string[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  // Browser clients use an HTTP-only cookie instead of a header.
  const cookie = (request.cookies as Record<string, string | undefined> | undefined)?.fm_access;
  return cookie ?? null;
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('auth', undefined);

  app.decorate('authenticate', async (request: FastifyRequest) => {
    const token = bearerToken(request);
    if (!token) throw unauthorized('Missing access token');

    const claims = verifyAccessToken(token);
    // Permissions are re-read from the database rather than trusted from the
    // token, so revoking a role takes effect within the cache TTL instead of
    // waiting for the access token to expire.
    const access = await loadUserAccess(claims.sub);
    if (!access) throw unauthorized('Account no longer exists');
    if (access.status !== 'ACTIVE') {
      throw forbidden(`Account is ${access.status.toLowerCase().replace(/_/g, ' ')}`);
    }
    request.auth = access;
  });

  const enforce =
    (mode: 'all' | 'any', permissions: string[]) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) await app.authenticate(request, reply);
      const auth = request.auth;
      if (!auth) throw unauthorized();

      const granted =
        mode === 'all'
          ? permissions.every((p) => auth.permissions.includes(p))
          : permissions.some((p) => auth.permissions.includes(p));

      if (!granted) {
        const missing = permissions.filter((p) => !auth.permissions.includes(p));
        await recordAudit({
          userId: auth.userId,
          action: 'PERMISSION_DENIED',
          resource: request.routeOptions?.url ?? request.url,
          metadata: { required: permissions, missing, mode },
          request,
        });
        throw forbidden('You do not have permission to perform this action', {
          required: permissions,
          missing,
        });
      }
    };

  app.decorate('requirePermission', (...permissions: string[]) => enforce('all', permissions));
  app.decorate('requireAnyPermission', (...permissions: string[]) => enforce('any', permissions));
});

/** Convenience re-export so route files read declaratively. */
export const P = Permission;
