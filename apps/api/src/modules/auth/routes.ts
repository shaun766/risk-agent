import { hashPassword, prisma, toDecimal, toRateDecimal, verifyPassword } from '@flowmoney/database';
import {
  AuditAction,
  Permission,
  loginSchema,
  refreshSchema,
  registerSchema,
  updateProfileSchema,
} from '@flowmoney/shared-types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env, isProduction } from '../../config/env';
import { recordAudit } from '../../lib/audit';
import { newId } from '../../lib/crypto';
import { conflict, unauthorized } from '../../lib/errors';
import { invalidateFinancialCache } from '../../services/financial.service';
import { invalidateUserAccess, loadUserAccess } from './rbac';
import {
  accessTokenTtlSeconds,
  issueRefreshToken,
  revokeAllForUser,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from './tokens';

const ACCESS_COOKIE = 'fm_access';
const REFRESH_COOKIE = 'fm_refresh';

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE || isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string): void {
  reply.setCookie(ACCESS_COOKIE, accessToken, cookieOptions(accessTokenTtlSeconds()));
  reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions(30 * 86_400));
}

function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(ACCESS_COOKIE, { path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { path: '/' });
}

function presentedRefreshToken(request: FastifyRequest): string | null {
  const body = refreshSchema.safeParse(request.body ?? {});
  if (body.success && body.data.refreshToken) return body.data.refreshToken;
  const cookie = (request.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
  return cookie ?? null;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Registration creates the user, their profile, a CUSTOMER role assignment
   * and a token pair in one transaction — a half-created account with no role
   * would be unusable and hard to diagnose.
   */
  app.post('/auth/register', {
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    handler: async (request, reply) => {
      const input = registerSchema.parse(request.body);

      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) throw conflict('An account with this email already exists');

      if (input.phone) {
        const phoneTaken = await prisma.user.findUnique({ where: { phone: input.phone } });
        if (phoneTaken) throw conflict('An account with this phone number already exists');
      }

      const customerRole = await prisma.role.findUnique({ where: { key: 'CUSTOMER' } });
      if (!customerRole) {
        throw new Error('CUSTOMER role is missing — run `pnpm db:seed` before registering users');
      }

      const passwordHash = await hashPassword(input.password);
      const user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          phone: input.phone ?? null,
          status: 'ACTIVE',
          profile: {
            create: {
              declaredMonthlyIncome:
                input.monthlyIncome !== undefined ? toDecimal(input.monthlyIncome) : null,
            },
          },
          roles: { create: { roleId: customerRole.id } },
        },
      });

      const access = await loadUserAccess(user.id);
      const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        roles: access?.roles ?? ['CUSTOMER'],
        permissions: access?.permissions ?? [],
      });
      const refreshToken = await issueRefreshToken(user.id, newId(), {
        userAgent: request.headers['user-agent'] ?? null,
        ipAddress: request.ip,
      });
      setAuthCookies(reply, accessToken, refreshToken);

      await recordAudit({
        userId: user.id,
        action: AuditAction.USER_REGISTERED,
        resource: 'user',
        resourceId: user.id,
        request,
      });

      return reply.status(201).send({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roles: access?.roles ?? ['CUSTOMER'],
          permissions: access?.permissions ?? [],
        },
        accessToken,
        refreshToken,
        expiresIn: accessTokenTtlSeconds(),
      });
    },
  });

  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    handler: async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const user = await prisma.user.findUnique({ where: { email: input.email } });

      // Always run a verification so a missing account and a wrong password
      // take indistinguishable time.
      const passwordOk = user
        ? await verifyPassword(input.password, user.passwordHash)
        : await verifyPassword(input.password, 'scrypt$32768$8$1$AAAA$AAAA');

      if (!user || !passwordOk) {
        throw unauthorized('Incorrect email or password');
      }
      if (user.status !== 'ACTIVE') {
        throw unauthorized(`Account is ${user.status.toLowerCase().replace(/_/g, ' ')}`);
      }

      const access = await loadUserAccess(user.id);
      const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        roles: access?.roles ?? [],
        permissions: access?.permissions ?? [],
      });
      const refreshToken = await issueRefreshToken(user.id, newId(), {
        userAgent: request.headers['user-agent'] ?? null,
        ipAddress: request.ip,
      });
      setAuthCookies(reply, accessToken, refreshToken);

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await recordAudit({ userId: user.id, action: AuditAction.USER_LOGIN, request });

      return {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roles: access?.roles ?? [],
          permissions: access?.permissions ?? [],
        },
        accessToken,
        refreshToken,
        expiresIn: accessTokenTtlSeconds(),
      };
    },
  });

  app.post('/auth/refresh', async (request, reply) => {
    const presented = presentedRefreshToken(request);
    if (!presented) throw unauthorized('Missing refresh token');

    const rotated = await rotateRefreshToken(presented, {
      userAgent: request.headers['user-agent'] ?? null,
      ipAddress: request.ip,
    });
    const access = await loadUserAccess(rotated.userId);
    if (!access) throw unauthorized('Account no longer exists');

    const accessToken = signAccessToken({
      sub: access.userId,
      email: access.email,
      roles: access.roles,
      permissions: access.permissions,
    });
    setAuthCookies(reply, accessToken, rotated.refreshToken);
    await recordAudit({ userId: access.userId, action: AuditAction.TOKEN_REFRESHED, request });

    return { accessToken, refreshToken: rotated.refreshToken, expiresIn: accessTokenTtlSeconds() };
  });

  app.post('/auth/logout', async (request, reply) => {
    const presented = presentedRefreshToken(request);
    if (presented) await revokeRefreshToken(presented);
    clearAuthCookies(reply);
    if (request.auth) {
      await recordAudit({ userId: request.auth.userId, action: AuditAction.USER_LOGOUT, request });
    }
    return { ok: true };
  });

  app.post('/auth/logout-all', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const userId = request.auth!.userId;
      await revokeAllForUser(userId);
      await invalidateUserAccess(userId);
      clearAuthCookies(reply);
      return { ok: true };
    },
  });

  app.get('/auth/me', {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const auth = request.auth!;
      const user = await prisma.user.findUnique({
        where: { id: auth.userId },
        include: { profile: true },
      });
      if (!user) throw unauthorized('Account no longer exists');

      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        status: user.status,
        roles: auth.roles,
        permissions: auth.permissions,
        profile: user.profile
          ? {
              occupation: user.profile.occupation,
              city: user.profile.city,
              currency: user.profile.currency,
              locale: user.profile.locale,
              declaredMonthlyIncome: user.profile.declaredMonthlyIncome
                ? Number(user.profile.declaredMonthlyIncome)
                : null,
              emergencyFundTargetMonths: Number(user.profile.emergencyFundTargetMonths),
              emergencyReserveAmount: user.profile.emergencyReserveAmount
                ? Number(user.profile.emergencyReserveAmount)
                : null,
              whatsappOptIn: user.profile.whatsappOptIn,
              voiceRepliesEnabled: user.profile.voiceRepliesEnabled,
              onboardingCompleted: user.profile.onboardingCompleted,
            }
          : null,
      };
    },
  });

  /**
   * Self-service profile update. Anything that feeds the financial engine
   * (income, emergency-fund settings) invalidates the cached snapshot so the
   * dashboard reflects the change on the very next request.
   */
  app.patch('/auth/profile', {
    preHandler: [app.requirePermission(Permission.MANAGE_OWN_PROFILE)],
    handler: async (request) => {
      const input = updateProfileSchema.parse(request.body);
      const userId = request.auth!.userId;

      if (input.fullName) {
        await prisma.user.update({ where: { id: userId }, data: { fullName: input.fullName } });
      }

      await prisma.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          occupation: input.occupation ?? null,
          city: input.city ?? null,
          declaredMonthlyIncome:
            input.declaredMonthlyIncome !== undefined && input.declaredMonthlyIncome !== null
              ? toDecimal(input.declaredMonthlyIncome)
              : null,
          emergencyFundTargetMonths:
            input.emergencyFundTargetMonths !== undefined
              ? toRateDecimal(input.emergencyFundTargetMonths, 2)
              : undefined,
          emergencyReserveAmount:
            input.emergencyReserveAmount !== undefined && input.emergencyReserveAmount !== null
              ? toDecimal(input.emergencyReserveAmount)
              : null,
          monthlyDebtPayments:
            input.monthlyDebtPayments !== undefined ? toDecimal(input.monthlyDebtPayments) : undefined,
          whatsappOptIn: input.whatsappOptIn ?? false,
          voiceRepliesEnabled: input.voiceRepliesEnabled ?? true,
          onboardingCompleted: true,
        },
        update: {
          ...(input.occupation !== undefined ? { occupation: input.occupation } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.declaredMonthlyIncome !== undefined
            ? {
                declaredMonthlyIncome:
                  input.declaredMonthlyIncome !== null ? toDecimal(input.declaredMonthlyIncome) : null,
              }
            : {}),
          ...(input.emergencyFundTargetMonths !== undefined
            ? { emergencyFundTargetMonths: toRateDecimal(input.emergencyFundTargetMonths, 2) }
            : {}),
          ...(input.emergencyReserveAmount !== undefined
            ? {
                emergencyReserveAmount:
                  input.emergencyReserveAmount !== null ? toDecimal(input.emergencyReserveAmount) : null,
              }
            : {}),
          ...(input.monthlyDebtPayments !== undefined
            ? { monthlyDebtPayments: toDecimal(input.monthlyDebtPayments) }
            : {}),
          ...(input.whatsappOptIn !== undefined ? { whatsappOptIn: input.whatsappOptIn } : {}),
          ...(input.voiceRepliesEnabled !== undefined
            ? { voiceRepliesEnabled: input.voiceRepliesEnabled }
            : {}),
          onboardingCompleted: true,
        },
      });

      await invalidateFinancialCache(userId);
      await recordAudit({ userId, action: AuditAction.PROFILE_UPDATED, resource: 'user_profile', request });

      return { ok: true };
    },
  });
}
