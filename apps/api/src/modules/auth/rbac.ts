import { prisma } from '@flowmoney/database';
import { cacheGet, cacheSet, cacheInvalidate } from '../../lib/redis';

export interface UserAccess {
  userId: string;
  email: string;
  fullName: string;
  status: string;
  roles: string[];
  permissions: string[];
}

const CACHE_TTL_SECONDS = 60;
const cacheKey = (userId: string) => `rbac:user:${userId}`;

/**
 * Resolves a user's effective permissions from the database.
 *
 * Roles are rows, not hard-coded enums, so a bank can define
 * "Premium Wealth Advisor" at runtime and it is enforced immediately. Nothing
 * in the codebase branches on a role name — only on permissions.
 */
export async function loadUserAccess(userId: string): Promise<UserAccess | null> {
  const cached = await cacheGet<UserAccess>(cacheKey(userId));
  if (cached) return cached;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      status: true,
      roles: {
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        select: {
          role: {
            select: {
              key: true,
              permissions: { select: { permission: { select: { key: true } } } },
            },
          },
        },
      },
    },
  });
  if (!user) return null;

  const permissions = new Set<string>();
  for (const assignment of user.roles) {
    for (const rolePermission of assignment.role.permissions) {
      permissions.add(rolePermission.permission.key);
    }
  }

  const access: UserAccess = {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    roles: user.roles.map((r) => r.role.key),
    permissions: [...permissions].sort(),
  };

  await cacheSet(cacheKey(userId), access, CACHE_TTL_SECONDS);
  return access;
}

/** Call whenever a role assignment or a role's permission set changes. */
export async function invalidateUserAccess(userId?: string): Promise<void> {
  await cacheInvalidate(userId ? cacheKey(userId) : 'rbac:user:*');
}

export function hasPermission(access: { permissions: string[] }, permission: string): boolean {
  return access.permissions.includes(permission);
}

export function hasAnyPermission(access: { permissions: string[] }, permissions: string[]): boolean {
  return permissions.some((permission) => access.permissions.includes(permission));
}
