import { prisma, hashToken } from '@flowmoney/database';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { randomToken } from '../../lib/crypto';
import { unauthorized } from '../../lib/errors';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  type: 'access';
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const ISSUER = 'flowmoney-ai';

export function signAccessToken(claims: Omit<AccessTokenClaims, 'type'>): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
    issuer: ISSUER,
    audience: 'flowmoney-client',
  };
  return jwt.sign({ ...claims, type: 'access' }, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: ISSUER,
      audience: 'flowmoney-client',
    });
    if (typeof decoded === 'string' || decoded.type !== 'access') {
      throw unauthorized('Invalid token type');
    }
    return decoded as unknown as AccessTokenClaims;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw unauthorized('Access token expired');
    throw unauthorized('Invalid access token');
  }
}

function refreshExpiry(): Date {
  const ttl = env.JWT_REFRESH_TTL;
  const match = /^(\d+)([smhd])$/.exec(ttl);
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const ms = match ? Number(match[1]) * (multipliers[match[2] ?? 'd'] ?? 86_400_000) : 30 * 86_400_000;
  return new Date(Date.now() + ms);
}

/**
 * Refresh tokens are opaque random strings stored only as SHA-256 digests, and
 * grouped into a "family". Reusing an already-rotated token revokes the whole
 * family — the standard defence against a stolen refresh token being replayed.
 */
export async function issueRefreshToken(
  userId: string,
  familyId: string,
  context: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<string> {
  const token = randomToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      familyId,
      expiresAt: refreshExpiry(),
      userAgent: context.userAgent ?? null,
      ipAddress: context.ipAddress ?? null,
    },
  });
  return token;
}

export async function rotateRefreshToken(
  presented: string,
  context: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<{ userId: string; refreshToken: string }> {
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(presented) } });
  if (!record) throw unauthorized('Invalid refresh token');

  if (record.revokedAt) {
    // Replay of a rotated token: assume compromise and kill the family.
    await prisma.refreshToken.updateMany({
      where: { familyId: record.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('Refresh token has already been used. Please sign in again.');
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw unauthorized('Refresh token expired');
  }

  const next = randomToken();
  await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        userId: record.userId,
        tokenHash: hashToken(next),
        familyId: record.familyId,
        expiresAt: refreshExpiry(),
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
      },
    }),
    prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    }),
  ]);

  return { userId: record.userId, refreshToken: next };
}

export async function revokeRefreshToken(presented: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(presented), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function accessTokenTtlSeconds(): number {
  const match = /^(\d+)([smhd])$/.exec(env.JWT_ACCESS_TTL);
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };
  return match ? Number(match[1]) * (multipliers[match[2] ?? 'm'] ?? 60) : 900;
}
