import { prisma, toDecimal, toNumber } from '@flowmoney/database';
import { Permission, savingsGoalSchema, uuid } from '@flowmoney/shared-types';
import type { FastifyInstance } from 'fastify';
import { notFound } from '../../lib/errors';
import { invalidateFinancialCache } from '../../services/financial.service';

function monthsToTarget(target: number, current: number, monthly: number): number | null {
  if (monthly <= 0) return null;
  return Math.max(0, Math.ceil((target - current) / monthly));
}

export async function goalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/goals', {
    preHandler: [app.requirePermission(Permission.MANAGE_OWN_SAVINGS_GOALS)],
    handler: async (request) => {
      const goals = await prisma.savingsGoal.findMany({
        where: { userId: request.auth!.userId },
        orderBy: { createdAt: 'desc' },
      });
      return {
        goals: goals.map((goal) => {
          const target = toNumber(goal.targetAmount);
          const current = toNumber(goal.currentAmount);
          const monthly = toNumber(goal.monthlyContribution);
          return {
            id: goal.id,
            name: goal.name,
            targetAmount: target,
            currentAmount: current,
            monthlyContribution: monthly,
            progressPercent: target > 0 ? Math.round((current / target) * 10_000) / 100 : 0,
            monthsToTarget: monthsToTarget(target, current, monthly),
            targetDate: goal.targetDate,
            status: goal.status,
          };
        }),
      };
    },
  });

  app.post('/goals', {
    preHandler: [app.requirePermission(Permission.MANAGE_OWN_SAVINGS_GOALS)],
    handler: async (request, reply) => {
      const input = savingsGoalSchema.parse(request.body);
      const goal = await prisma.savingsGoal.create({
        data: {
          userId: request.auth!.userId,
          name: input.name,
          targetAmount: toDecimal(input.targetAmount),
          currentAmount: toDecimal(input.currentAmount),
          monthlyContribution: toDecimal(input.monthlyContribution),
          targetDate: input.targetDate ? new Date(input.targetDate) : null,
          categoryKey: input.categoryKey ?? null,
        },
      });
      await invalidateFinancialCache(request.auth!.userId);
      return reply.status(201).send({ id: goal.id, name: goal.name });
    },
  });

  app.patch('/goals/:id', {
    preHandler: [app.requirePermission(Permission.MANAGE_OWN_SAVINGS_GOALS)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const input = savingsGoalSchema.partial().parse(request.body);
      const existing = await prisma.savingsGoal.findFirst({
        where: { id, userId: request.auth!.userId },
      });
      if (!existing) throw notFound('Savings goal');

      const updated = await prisma.savingsGoal.update({
        where: { id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.targetAmount !== undefined ? { targetAmount: toDecimal(input.targetAmount) } : {}),
          ...(input.currentAmount !== undefined
            ? { currentAmount: toDecimal(input.currentAmount) }
            : {}),
          ...(input.monthlyContribution !== undefined
            ? { monthlyContribution: toDecimal(input.monthlyContribution) }
            : {}),
          ...(input.targetDate !== undefined
            ? { targetDate: input.targetDate ? new Date(input.targetDate) : null }
            : {}),
        },
      });

      // Close the goal out automatically once it is funded.
      if (toNumber(updated.currentAmount) >= toNumber(updated.targetAmount)) {
        await prisma.savingsGoal.update({ where: { id }, data: { status: 'ACHIEVED' } });
      }
      await invalidateFinancialCache(request.auth!.userId);
      return { ok: true };
    },
  });

  app.delete('/goals/:id', {
    preHandler: [app.requirePermission(Permission.MANAGE_OWN_SAVINGS_GOALS)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const existing = await prisma.savingsGoal.findFirst({
        where: { id, userId: request.auth!.userId },
      });
      if (!existing) throw notFound('Savings goal');
      await prisma.savingsGoal.update({ where: { id }, data: { status: 'CANCELLED' } });
      return { ok: true };
    },
  });
}
