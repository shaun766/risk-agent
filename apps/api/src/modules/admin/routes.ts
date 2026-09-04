import { Prisma, prisma, toDecimal, toNumber, toRateDecimal } from '@flowmoney/database';
import {
  ALL_PERMISSIONS,
  AuditAction,
  PERMISSION_GROUPS,
  Permission,
  adminUserQuerySchema,
  assignRoleSchema,
  createAgentSchema,
  createProductSchema,
  createRoleSchema,
  paginationSchema,
  updateAgentSchema,
  updateProductSchema,
  updateRoleSchema,
  uuid,
} from '@flowmoney/shared-types';
import type { FastifyInstance } from 'fastify';
import { recordAudit } from '../../lib/audit';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { paginate, skipTake } from '../../lib/pagination';
import { invalidateUserAccess } from '../auth/rbac';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // ------------------------------------------------------------- customers --
  app.get('/admin/users', {
    preHandler: [app.requirePermission(Permission.VIEW_CUSTOMERS)],
    handler: async (request) => {
      const query = adminUserQuerySchema.parse(request.query ?? {});
      const where: Prisma.UserWhereInput = {
        ...(query.search
          ? {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' } },
                { fullName: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(query.roleKey ? { roles: { some: { role: { key: query.roleKey } } } } : {}),
        ...(query.status ? { status: query.status as Prisma.UserWhereInput['status'] } : {}),
      };

      const [rows, total] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: {
            roles: { include: { role: { select: { key: true, name: true } } } },
            profile: { select: { city: true, occupation: true, declaredMonthlyIncome: true } },
            _count: { select: { bankAccounts: true, transactions: true, purchaseDecisions: true } },
          },
          ...skipTake(query.page, query.pageSize),
        }),
        prisma.user.count({ where }),
      ]);

      return paginate(
        rows.map((user) => ({
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          status: user.status,
          city: user.profile?.city ?? null,
          occupation: user.profile?.occupation ?? null,
          declaredMonthlyIncome: toNumber(user.profile?.declaredMonthlyIncome),
          roles: user.roles.map((assignment) => assignment.role),
          counts: user._count,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
        })),
        total,
        query.page,
        query.pageSize,
      );
    },
  });

  app.get('/admin/users/:id', {
    preHandler: [app.requirePermission(Permission.VIEW_CUSTOMER_FINANCIALS)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          profile: true,
          roles: { include: { role: { select: { key: true, name: true } } } },
          bankAccounts: true,
          healthScores: { orderBy: { createdAt: 'desc' }, take: 6 },
          purchaseDecisions: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      });
      if (!user) throw notFound('User');

      await recordAudit({
        userId: request.auth!.userId,
        subjectId: id,
        action: 'VIEW_CUSTOMER_FINANCIALS',
        resource: 'user',
        resourceId: id,
        request,
      });

      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: user.status,
        roles: user.roles.map((assignment) => assignment.role),
        profile: user.profile,
        accounts: user.bankAccounts.map((account) => ({
          id: account.id,
          nickname: account.nickname,
          type: account.type,
          maskedNumber: account.maskedNumber,
          currentBalance: toNumber(account.currentBalance),
        })),
        healthScores: user.healthScores.map((score) => ({
          month: score.month,
          score: toNumber(score.score),
          riskLevel: score.riskLevel,
        })),
        purchaseDecisions: user.purchaseDecisions.map((decision) => ({
          id: decision.id,
          description: decision.description,
          price: toNumber(decision.price),
          verdict: decision.verdict,
          score: toNumber(decision.score),
          createdAt: decision.createdAt,
        })),
      };
    },
  });

  app.patch('/admin/users/:id/status', {
    preHandler: [app.requirePermission(Permission.MANAGE_CUSTOMERS)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const body = request.body as { status?: string };
      const allowed = ['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'CLOSED'];
      if (!body.status || !allowed.includes(body.status)) {
        throw badRequest(`status must be one of ${allowed.join(', ')}`);
      }
      await prisma.user.update({
        where: { id },
        data: { status: body.status as Prisma.UserUpdateInput['status'] },
      });
      await invalidateUserAccess(id);
      await recordAudit({
        userId: request.auth!.userId,
        subjectId: id,
        action: 'USER_STATUS_CHANGED',
        resource: 'user',
        resourceId: id,
        metadata: { status: body.status },
        request,
      });
      return { ok: true };
    },
  });

  // ----------------------------------------------------------------- roles --
  app.get('/admin/permissions', {
    preHandler: [app.requirePermission(Permission.VIEW_ROLES)],
    handler: async () => {
      const permissions = await prisma.permission.findMany({ orderBy: { key: 'asc' } });
      return {
        permissions: permissions.map((permission) => ({
          key: permission.key,
          name: permission.name,
          group: permission.group,
          description: permission.description,
        })),
        groups: PERMISSION_GROUPS,
        all: ALL_PERMISSIONS,
      };
    },
  });

  app.get('/admin/roles', {
    preHandler: [app.requirePermission(Permission.VIEW_ROLES)],
    handler: async () => {
      const roles = await prisma.role.findMany({
        include: {
          permissions: { include: { permission: { select: { key: true } } } },
          _count: { select: { users: true } },
        },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      });
      return {
        roles: roles.map((role) => ({
          id: role.id,
          key: role.key,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          userCount: role._count.users,
          permissions: role.permissions.map((rp) => rp.permission.key),
        })),
      };
    },
  });

  /**
   * Dynamic role creation. A bank can define "Premium Wealth Advisor" with an
   * arbitrary permission set and it is enforced on the very next request — no
   * deploy, and no role name anywhere in application logic.
   */
  app.post('/admin/roles', {
    preHandler: [app.requirePermission(Permission.MANAGE_ROLES)],
    handler: async (request, reply) => {
      const input = createRoleSchema.parse(request.body);
      const existing = await prisma.role.findUnique({ where: { key: input.key } });
      if (existing) throw conflict(`A role with key ${input.key} already exists`);

      const unknown = input.permissions.filter(
        (permission) => !(ALL_PERMISSIONS as string[]).includes(permission),
      );
      if (unknown.length > 0) throw badRequest(`Unknown permissions: ${unknown.join(', ')}`);

      const permissions = await prisma.permission.findMany({
        where: { key: { in: input.permissions } },
        select: { id: true },
      });

      const role = await prisma.role.create({
        data: {
          key: input.key,
          name: input.name,
          description: input.description,
          isSystem: false,
          permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
        },
      });

      await recordAudit({
        userId: request.auth!.userId,
        action: AuditAction.ROLE_CREATED,
        resource: 'role',
        resourceId: role.id,
        metadata: { key: input.key, permissions: input.permissions },
        request,
      });
      return reply.status(201).send({ id: role.id, key: role.key });
    },
  });

  app.patch('/admin/roles/:id', {
    preHandler: [app.requirePermission(Permission.MANAGE_ROLES)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const input = updateRoleSchema.parse(request.body);
      const role = await prisma.role.findUnique({ where: { id } });
      if (!role) throw notFound('Role');
      if (role.isSystem && input.permissions) {
        throw forbidden('Permissions on a system role cannot be changed');
      }

      await prisma.$transaction(async (tx) => {
        await tx.role.update({
          where: { id },
          data: {
            ...(input.name ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
          },
        });
        if (input.permissions) {
          const permissions = await tx.permission.findMany({
            where: { key: { in: input.permissions } },
            select: { id: true },
          });
          await tx.rolePermission.deleteMany({ where: { roleId: id } });
          await tx.rolePermission.createMany({
            data: permissions.map((p) => ({ roleId: id, permissionId: p.id })),
            skipDuplicates: true,
          });
        }
      });

      // Every holder of this role now has a different permission set.
      await invalidateUserAccess();
      await recordAudit({
        userId: request.auth!.userId,
        action: AuditAction.ROLE_UPDATED,
        resource: 'role',
        resourceId: id,
        metadata: { permissions: input.permissions },
        request,
      });
      return { ok: true };
    },
  });

  app.delete('/admin/roles/:id', {
    preHandler: [app.requirePermission(Permission.MANAGE_ROLES)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const role = await prisma.role.findUnique({
        where: { id },
        include: { _count: { select: { users: true } } },
      });
      if (!role) throw notFound('Role');
      if (role.isSystem) throw forbidden('System roles cannot be deleted');
      if (role._count.users > 0) {
        throw conflict(`${role._count.users} user(s) still hold this role`);
      }
      await prisma.role.delete({ where: { id } });
      return { ok: true };
    },
  });

  app.post('/admin/roles/assign', {
    preHandler: [app.requirePermission(Permission.ASSIGN_ROLES)],
    handler: async (request) => {
      const input = assignRoleSchema.parse(request.body);
      const role = await prisma.role.findUnique({ where: { key: input.roleKey } });
      if (!role) throw notFound('Role');

      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: input.userId, roleId: role.id } },
        create: { userId: input.userId, roleId: role.id, assignedBy: request.auth!.userId },
        update: { assignedBy: request.auth!.userId, expiresAt: null },
      });

      await invalidateUserAccess(input.userId);
      await recordAudit({
        userId: request.auth!.userId,
        subjectId: input.userId,
        action: AuditAction.ROLE_ASSIGNED,
        resource: 'role',
        resourceId: role.id,
        metadata: { roleKey: input.roleKey },
        request,
      });
      return { ok: true };
    },
  });

  app.post('/admin/roles/revoke', {
    preHandler: [app.requirePermission(Permission.ASSIGN_ROLES)],
    handler: async (request) => {
      const input = assignRoleSchema.parse(request.body);
      const role = await prisma.role.findUnique({ where: { key: input.roleKey } });
      if (!role) throw notFound('Role');
      await prisma.userRole.deleteMany({ where: { userId: input.userId, roleId: role.id } });
      await invalidateUserAccess(input.userId);
      return { ok: true };
    },
  });

  // ---------------------------------------------------------------- agents --
  app.get('/admin/agents', {
    preHandler: [app.requirePermission(Permission.VIEW_AGENTS)],
    handler: async () => {
      const agents = await prisma.aIAgent.findMany({
        include: {
          toolPermissions: true,
          _count: { select: { conversations: true, messages: true } },
        },
        orderBy: [{ isSystem: 'desc' }, { priority: 'asc' }],
      });
      return {
        agents: agents.map((agent) => ({
          id: agent.id,
          key: agent.key,
          name: agent.name,
          description: agent.description,
          systemInstructions: agent.systemInstructions,
          outputFormat: agent.outputFormat,
          handledIntents: agent.handledIntents,
          requiredPermissions: agent.requiredPermissions,
          allowedTools: agent.toolPermissions
            .filter((permission) => permission.isEnabled)
            .map((permission) => permission.toolName),
          temperature: toNumber(agent.temperature),
          maxTokens: agent.maxTokens,
          model: agent.model,
          isEnabled: agent.isEnabled,
          isSystem: agent.isSystem,
          priority: agent.priority,
          usage: agent._count,
          updatedAt: agent.updatedAt,
        })),
      };
    },
  });

  /**
   * Dynamic agent creation. Instructions, tools, permissions and output format
   * are all data — the orchestrator reads them per request, so a new agent is
   * live immediately.
   */
  app.post('/admin/agents', {
    preHandler: [app.requirePermission(Permission.MANAGE_AGENTS)],
    handler: async (request, reply) => {
      const input = createAgentSchema.parse(request.body);
      const existing = await prisma.aIAgent.findUnique({ where: { key: input.key } });
      if (existing) throw conflict(`An agent with key ${input.key} already exists`);

      const agent = await prisma.aIAgent.create({
        data: {
          key: input.key,
          name: input.name,
          description: input.description,
          systemInstructions: input.systemInstructions,
          outputFormat: input.outputFormat as Prisma.AIAgentCreateInput['outputFormat'],
          handledIntents: input.handledIntents,
          requiredPermissions: input.requiredPermissions,
          temperature: toRateDecimal(input.temperature, 2),
          maxTokens: input.maxTokens,
          model: input.model ?? null,
          isEnabled: input.isEnabled,
          isSystem: false,
          priority: input.priority,
          createdById: request.auth!.userId,
          toolPermissions: {
            create: input.allowedTools.map((toolName) => ({ toolName, isEnabled: true })),
          },
          configurations: {
            create: {
              version: 1,
              note: 'Created via admin portal',
              changedBy: request.auth!.userId,
              config: input as unknown as Prisma.InputJsonValue,
            },
          },
        },
      });

      await recordAudit({
        userId: request.auth!.userId,
        action: AuditAction.AGENT_CREATED,
        resource: 'ai_agent',
        resourceId: agent.id,
        metadata: { key: input.key, tools: input.allowedTools },
        request,
      });
      return reply.status(201).send({ id: agent.id, key: agent.key });
    },
  });

  app.patch('/admin/agents/:id', {
    preHandler: [app.requirePermission(Permission.MANAGE_AGENTS)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const input = updateAgentSchema.parse(request.body);
      const agent = await prisma.aIAgent.findUnique({ where: { id } });
      if (!agent) throw notFound('Agent');

      const latest = await prisma.aIAgentConfiguration.findFirst({
        where: { agentId: id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      await prisma.$transaction(async (tx) => {
        await tx.aIAgent.update({
          where: { id },
          data: {
            ...(input.name ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.systemInstructions ? { systemInstructions: input.systemInstructions } : {}),
            ...(input.outputFormat
              ? { outputFormat: input.outputFormat as Prisma.AIAgentUpdateInput['outputFormat'] }
              : {}),
            ...(input.handledIntents ? { handledIntents: input.handledIntents } : {}),
            ...(input.requiredPermissions ? { requiredPermissions: input.requiredPermissions } : {}),
            ...(input.temperature !== undefined
              ? { temperature: toRateDecimal(input.temperature, 2) }
              : {}),
            ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
            ...(input.model !== undefined ? { model: input.model } : {}),
            ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
            ...(input.priority !== undefined ? { priority: input.priority } : {}),
          },
        });

        if (input.allowedTools) {
          await tx.agentToolPermission.deleteMany({ where: { agentId: id } });
          await tx.agentToolPermission.createMany({
            data: input.allowedTools.map((toolName) => ({ agentId: id, toolName, isEnabled: true })),
            skipDuplicates: true,
          });
        }

        // Every edit is versioned so a past answer can be replayed against the
        // instructions that actually produced it.
        await tx.aIAgentConfiguration.create({
          data: {
            agentId: id,
            version: (latest?.version ?? 0) + 1,
            note: 'Updated via admin portal',
            changedBy: request.auth!.userId,
            config: input as unknown as Prisma.InputJsonValue,
          },
        });
      });

      await recordAudit({
        userId: request.auth!.userId,
        action: AuditAction.AGENT_UPDATED,
        resource: 'ai_agent',
        resourceId: id,
        metadata: { changed: Object.keys(input) },
        request,
      });
      return { ok: true };
    },
  });

  app.delete('/admin/agents/:id', {
    preHandler: [app.requirePermission(Permission.MANAGE_AGENTS)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const agent = await prisma.aIAgent.findUnique({ where: { id } });
      if (!agent) throw notFound('Agent');
      if (agent.isSystem) {
        throw forbidden('System agents cannot be deleted — disable it instead');
      }
      await prisma.aIAgent.delete({ where: { id } });
      await recordAudit({
        userId: request.auth!.userId,
        action: AuditAction.AGENT_DELETED,
        resource: 'ai_agent',
        resourceId: id,
        request,
      });
      return { ok: true };
    },
  });

  app.get('/admin/agents/:id/versions', {
    preHandler: [app.requirePermission(Permission.VIEW_AGENTS)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const versions = await prisma.aIAgentConfiguration.findMany({
        where: { agentId: id },
        orderBy: { version: 'desc' },
      });
      return { versions };
    },
  });

  app.get('/admin/tools', {
    preHandler: [app.requirePermission(Permission.VIEW_AGENTS)],
    handler: async () => {
      const { TOOL_DEFINITIONS } = await import('@flowmoney/ai-agents');
      return {
        tools: Object.values(TOOL_DEFINITIONS).map((tool) => ({
          name: tool.name,
          description: tool.description,
          requiredPermissions: tool.requiredPermissions,
          mutating: tool.mutating,
        })),
      };
    },
  });

  // -------------------------------------------------------------- products --
  app.get('/admin/products', {
    preHandler: [app.requirePermission(Permission.VIEW_FINANCIAL_PRODUCTS)],
    handler: async () => {
      const products = await prisma.financialProduct.findMany({
        include: { rates: true, bank: { select: { name: true } } },
        orderBy: { name: 'asc' },
      });
      return {
        products: products.map((product) => ({
          id: product.id,
          name: product.name,
          bank: product.bank?.name ?? null,
          type: product.type,
          riskLevel: product.riskLevel,
          liquidity: product.liquidity,
          minimumInvestment: toNumber(product.minimumInvestment),
          interestRate: toNumber(product.interestRate),
          expectedReturnLow: toNumber(product.expectedReturnLow),
          expectedReturnHigh: toNumber(product.expectedReturnHigh),
          lockInMonths: product.lockInMonths,
          bucket: product.bucket,
          description: product.description,
          isActive: product.isActive,
          rates: product.rates.map((rate) => ({
            tenureMonths: rate.tenureMonths,
            rate: toNumber(rate.rate),
          })),
        })),
      };
    },
  });

  app.post('/admin/products', {
    preHandler: [app.requirePermission(Permission.MANAGE_FINANCIAL_PRODUCTS)],
    handler: async (request, reply) => {
      const input = createProductSchema.parse(request.body);
      const product = await prisma.financialProduct.create({
        data: {
          name: input.name,
          type: input.type as Prisma.FinancialProductCreateInput['type'],
          riskLevel: input.riskLevel,
          liquidity: input.liquidity as Prisma.FinancialProductCreateInput['liquidity'],
          minimumInvestment: toDecimal(input.minimumInvestment),
          interestRate: toRateDecimal(input.interestRate),
          expectedReturnLow: toRateDecimal(input.expectedReturnLow),
          expectedReturnHigh: toRateDecimal(input.expectedReturnHigh),
          lockInMonths: input.lockInMonths,
          description: input.description,
          bucket: (input.bucket ?? null) as Prisma.FinancialProductCreateInput['bucket'],
          isActive: input.isActive,
        },
      });
      await recordAudit({
        userId: request.auth!.userId,
        action: AuditAction.PRODUCT_CREATED,
        resource: 'financial_product',
        resourceId: product.id,
        request,
      });
      return reply.status(201).send({ id: product.id });
    },
  });

  app.patch('/admin/products/:id', {
    preHandler: [app.requirePermission(Permission.MANAGE_FINANCIAL_PRODUCTS)],
    handler: async (request) => {
      const id = uuid.parse((request.params as { id: string }).id);
      const input = updateProductSchema.parse(request.body);
      const existing = await prisma.financialProduct.findUnique({ where: { id } });
      if (!existing) throw notFound('Product');

      await prisma.financialProduct.update({
        where: { id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
          ...(input.minimumInvestment !== undefined
            ? { minimumInvestment: toDecimal(input.minimumInvestment) }
            : {}),
          ...(input.interestRate !== undefined
            ? { interestRate: toRateDecimal(input.interestRate) }
            : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await recordAudit({
        userId: request.auth!.userId,
        action: AuditAction.PRODUCT_UPDATED,
        resource: 'financial_product',
        resourceId: id,
        request,
      });
      return { ok: true };
    },
  });

  // ------------------------------------------------------------- analytics --
  /**
   * Aggregate, anonymised analytics. Deliberately returns distributions and
   * counts only — no customer is identifiable from this endpoint.
   */
  app.get('/admin/analytics', {
    preHandler: [app.requireAnyPermission(
      Permission.VIEW_AGGREGATE_ANALYTICS,
      Permission.VIEW_SYSTEM_ANALYTICS,
    )],
    handler: async () => {
      const [
        userCount,
        activeUsers,
        accountCount,
        transactionCount,
        decisions,
        healthScores,
        conversations,
        agentUsage,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { status: 'ACTIVE' } }),
        prisma.bankAccount.count(),
        prisma.transaction.count(),
        prisma.purchaseDecision.groupBy({ by: ['verdict'], _count: true, _avg: { score: true } }),
        prisma.financialHealthScore.findMany({
          where: { snapshotId: { not: null } },
          select: { score: true, riskLevel: true },
        }),
        prisma.aIConversation.groupBy({ by: ['channel'], _count: true }),
        prisma.aIMessage.groupBy({
          by: ['agentId'],
          _count: true,
          where: { role: 'ASSISTANT' },
        }),
      ]);

      const scores = healthScores.map((row) => toNumber(row.score));
      const averageHealth = scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : 0;

      const riskDistribution = healthScores.reduce<Record<string, number>>((acc, row) => {
        acc[row.riskLevel] = (acc[row.riskLevel] ?? 0) + 1;
        return acc;
      }, {});

      const agents = await prisma.aIAgent.findMany({ select: { id: true, key: true, name: true } });
      const agentById = new Map(agents.map((agent) => [agent.id, agent]));

      return {
        users: { total: userCount, active: activeUsers },
        accounts: accountCount,
        transactions: transactionCount,
        purchaseDecisions: decisions.map((row) => ({
          verdict: row.verdict,
          count: row._count,
          averageScore: row._avg.score ? Math.round(toNumber(row._avg.score) * 100) / 100 : 0,
        })),
        financialHealth: { average: averageHealth, distribution: riskDistribution, sampled: scores.length },
        conversations: conversations.map((row) => ({ channel: row.channel, count: row._count })),
        agentUsage: agentUsage
          .filter((row) => row.agentId)
          .map((row) => ({
            agent: agentById.get(row.agentId!)?.key ?? 'unknown',
            name: agentById.get(row.agentId!)?.name ?? 'Unknown',
            messages: row._count,
          }))
          .sort((a, b) => b.messages - a.messages),
      };
    },
  });

  app.get('/admin/audit-logs', {
    preHandler: [app.requirePermission(Permission.VIEW_AUDIT_LOGS)],
    handler: async (request) => {
      const { page, pageSize } = paginationSchema.parse(request.query ?? {});
      const query = request.query as { action?: string; userId?: string };
      const where: Prisma.AuditLogWhereInput = {
        ...(query.action ? { action: query.action } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
      };

      const [rows, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { email: true, fullName: true } } },
          ...skipTake(page, pageSize),
        }),
        prisma.auditLog.count({ where }),
      ]);

      return paginate(rows, total, page, pageSize);
    },
  });
}
