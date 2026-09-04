import { prisma, type Prisma } from '@flowmoney/database';
import type { NotificationChannel, NotificationType } from '@flowmoney/shared-types';

/** Every account the scheduled sweeps should consider. */
export async function activeUserIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  return rows.map((row) => row.id);
}

/**
 * Creates a notification unless one of the same type was already raised for
 * this user inside `dedupeWindowHours` — the sweeps run frequently, but a
 * user should see one "you have idle cash" nudge a week, not one per run.
 */
export async function notifyOnce(args: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channel?: NotificationChannel;
  dedupeWindowHours?: number;
}): Promise<boolean> {
  const since = new Date(Date.now() - (args.dedupeWindowHours ?? 24) * 60 * 60 * 1000);
  const existing = await prisma.notification.findFirst({
    where: { userId: args.userId, type: args.type, createdAt: { gte: since } },
    select: { id: true },
  });
  if (existing) return false;

  await prisma.notification.create({
    data: {
      userId: args.userId,
      type: args.type,
      channel: args.channel ?? 'IN_APP',
      title: args.title,
      body: args.body,
      data: (args.data ?? {}) as Prisma.InputJsonValue,
      sentAt: new Date(),
    },
  });
  return true;
}
