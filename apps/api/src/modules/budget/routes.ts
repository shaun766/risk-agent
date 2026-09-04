import { Prisma, prisma, toDecimal, toNumber, toRateDecimal } from '@flowmoney/database';
import {
  AuditAction,
  BudgetStrategy,
  Permission,
  createBudgetSchema,
  presetFor,
  updateBudgetSchema,
  uuid,
} from '@flowmoney/shared-types';
import { deriveAllocations, monthKeyOf, strategyCatalogue } from '@flowmoney/financial-engine';
import type { FastifyInstance } from 'fastify';
import { recordAudit } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import {
  budgetStatusOf,
  getFinancialView,
  invalidateFinancialCache,
} from '../../services/financial.service';

function periodBounds(month: string): { start: Date; end: Date } {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year ?? 1970, (monthNumber ?? 1) - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year ?? 1970, monthNumber ?? 1, 0, 23, 59, 59, 999));
  return { start, end };
}

export async function budgetRoutes(app: FastifyInstance): Promise<void> {
  app.get('/budget/strategies', {
    preHandler: [app.authenticate],
    handler: async () => ({ strategies: strategyCatalogue() }),
  });

  app.get('/budget/current', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_BUDGET)],
    handler: async (request) => {
      const view = await getFinancialView(request.auth!.userId);
      return budgetStatusOf(view);
    },
  });

  /**
   * Creating a budget for a month replaces any existing one. Percentages come
   * from the chosen strategy unless the user supplies their own; per-category
   * allocations are derived from the envelope split so the two never disagree.
   */
  app.post('/budget', {
    preHandler: [app.requirePermission(Permission.MANAGE_OWN_BUDGET)],
    handler: async (request, reply) => {
      const input = createBudgetSchema.parse(request.body);
      const userId = request.auth!.userId;
      const month = input.month ?? monthKeyOf(new Date());
      const { start, end } = periodBounds(month);

      const profile = await prisma.userProfile.findUnique({ where: { userId } });
      const monthlyIncome =
        input.monthlyIncome ?? toNumber(profile?.declaredMonthlyIncome) ?? 0;
      if (monthlyIncome <= 0) {
        throw badRequest(
          'A monthly income is required to build a budget. Provide monthlyIncome or set it on your profile.',
        );
      }

      const preset = presetFor(input.strategy as BudgetStrategy);
      const percentages = {
        needsPercent: input.needsPercent ?? preset.needsPercent,
        wantsPercent: input.wantsPercent ?? preset.wantsPercent,
        savingsPercent: input.savingsPercent ?? preset.savingsPercent,
        investmentsPercent: input.investmentsPercent ?? preset.investmentsPercent,
        debtPercent: input.debtPercent ?? preset.debtPercent,
      };

      const categories = await prisma.transactionCategory.findMany();
      const categoryByKey = new Map(categories.map((c) => [c.key, c.id]));

      const allocations =
        input.allocations && input.allocations.length > 0
          ? input.allocations
          : deriveAllocations(monthlyIncome, input.strategy as BudgetStrategy, percentages).map((a) => ({
              categoryKey: a.categoryKey,
              allocated: a.allocated,
            }));

      const budget = await prisma.$transaction(async (tx) => {
        await tx.budget.deleteMany({ where: { userId, month } });
        const created = await tx.budget.create({
          data: {
            userId,
            strategy: input.strategy as BudgetStrategy,
            month,
            periodStart: start,
            periodEnd: end,
            monthlyIncome: toDecimal(monthlyIncome),
            needsPercent: toRateDecimal(percentages.needsPercent, 2),
            wantsPercent: toRateDecimal(percentages.wantsPercent, 2),
            savingsPercent: toRateDecimal(percentages.savingsPercent, 2),
            investmentsPercent: toRateDecimal(percentages.investmentsPercent, 2),
            debtPercent: toRateDecimal(percentages.debtPercent, 2),
            isActive: true,
          },
        });

        await tx.budgetCategory.createMany({
          data: allocations
            .filter((a) => categoryByKey.has(a.categoryKey))
            .map((a) => ({
              budgetId: created.id,
              categoryId: categoryByKey.get(a.categoryKey)!,
              allocated: toDecimal(a.allocated),
            })),
          skipDuplicates: true,
        });

        if (input.rules?.length) {
          await tx.budgetRule.createMany({
            data: input.rules.map((rule) => ({
              budgetId: created.id,
              type: rule.type as Prisma.BudgetRuleCreateManyInput['type'],
              categoryKey: rule.categoryKey ?? null,
              amount: toDecimal(rule.amount),
              label: rule.label,
            })),
          });
        }
        return created;
      });

      await invalidateFinancialCache(userId);
      await recordAudit({
        userId,
        action: AuditAction.BUDGET_UPDATED,
        resource: 'budget',
        resourceId: budget.id,
        metadata: { month, strategy: input.strategy, monthlyIncome },
        request,
      });

      const view = await getFinancialView(userId);
      return reply.status(201).send(budgetStatusOf(view));
    },
  });

  app.patch('/budget/:id', {
    preHandler: [app.requirePermission(Permission.MANAGE_OWN_BUDGET)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const input = updateBudgetSchema.parse(request.body);
      const userId = request.auth!.userId;

      const budget = await prisma.budget.findFirst({ where: { id, userId } });
      if (!budget) throw notFound('Budget');

      const categories = await prisma.transactionCategory.findMany();
      const categoryByKey = new Map(categories.map((c) => [c.key, c.id]));

      await prisma.$transaction(async (tx) => {
        await tx.budget.update({
          where: { id },
          data: {
            ...(input.monthlyIncome !== undefined
              ? { monthlyIncome: toDecimal(input.monthlyIncome) }
              : {}),
            ...(input.needsPercent !== undefined
              ? { needsPercent: toRateDecimal(input.needsPercent, 2) }
              : {}),
            ...(input.wantsPercent !== undefined
              ? { wantsPercent: toRateDecimal(input.wantsPercent, 2) }
              : {}),
            ...(input.savingsPercent !== undefined
              ? { savingsPercent: toRateDecimal(input.savingsPercent, 2) }
              : {}),
            ...(input.investmentsPercent !== undefined
              ? { investmentsPercent: toRateDecimal(input.investmentsPercent, 2) }
              : {}),
            ...(input.debtPercent !== undefined
              ? { debtPercent: toRateDecimal(input.debtPercent, 2) }
              : {}),
          },
        });

        if (input.allocations) {
          await tx.budgetCategory.deleteMany({ where: { budgetId: id } });
          await tx.budgetCategory.createMany({
            data: input.allocations
              .filter((a) => categoryByKey.has(a.categoryKey))
              .map((a) => ({
                budgetId: id,
                categoryId: categoryByKey.get(a.categoryKey)!,
                allocated: toDecimal(a.allocated),
              })),
            skipDuplicates: true,
          });
        }

        if (input.rules) {
          await tx.budgetRule.deleteMany({ where: { budgetId: id } });
          await tx.budgetRule.createMany({
            data: input.rules.map((rule) => ({
              budgetId: id,
              type: rule.type as Prisma.BudgetRuleCreateManyInput['type'],
              categoryKey: rule.categoryKey ?? null,
              amount: toDecimal(rule.amount),
              label: rule.label,
            })),
          });
        }
      });

      await invalidateFinancialCache(userId);
      await recordAudit({
        userId,
        action: AuditAction.BUDGET_UPDATED,
        resource: 'budget',
        resourceId: id,
        request,
      });

      const view = await getFinancialView(userId);
      return budgetStatusOf(view);
    },
  });

  app.get('/budget/rules', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_BUDGET)],
    handler: async (request) => {
      const budget = await prisma.budget.findFirst({
        where: { userId: request.auth!.userId, month: monthKeyOf(new Date()) },
        include: { rules: true },
      });
      return {
        rules:
          budget?.rules.map((rule) => ({
            id: rule.id,
            type: rule.type,
            categoryKey: rule.categoryKey,
            amount: toNumber(rule.amount),
            label: rule.label,
            isActive: rule.isActive,
          })) ?? [],
      };
    },
  });
}
