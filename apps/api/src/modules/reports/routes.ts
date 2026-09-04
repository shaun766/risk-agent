import { prisma } from '@flowmoney/database';
import { Permission, monthKey, reportQuerySchema } from '@flowmoney/shared-types';
import type { FastifyInstance } from 'fastify';
import { AuditAction } from '@flowmoney/shared-types';
import { recordAudit } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { generateMonthlyReport, listReports } from '../../services/report.service';
import { renderReportPdf } from '../../services/pdf.service';

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/reports/monthly', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_REPORTS)],
    handler: async (request) => ({ reports: await listReports(request.auth!.userId) }),
  });

  app.get('/reports/monthly/:month', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_REPORTS)],
    handler: async (request) => {
      const month = monthKey.parse((request.params as { month: string }).month);
      const query = reportQuerySchema.parse(request.query ?? {});
      const report = await generateMonthlyReport(request.auth!.userId, month, {
        regenerate: query.regenerate,
      });

      const stored = await prisma.monthlyReport.findUnique({
        where: { userId_month: { userId: request.auth!.userId, month } },
        select: { narrative: true, generatedAt: true },
      });

      return { ...report, narrative: stored?.narrative ?? null, generatedAt: stored?.generatedAt };
    },
  });

  /**
   * PDF export. The document is rendered from the same deterministic report
   * object the API returns, so the file can never disagree with the dashboard.
   */
  app.post('/reports/monthly/:month/export', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_REPORTS)],
    handler: async (request, reply) => {
      const month = monthKey.parse((request.params as { month: string }).month);
      const userId = request.auth!.userId;

      const report = await generateMonthlyReport(userId, month);
      const stored = await prisma.monthlyReport.findUnique({
        where: { userId_month: { userId, month } },
        select: { narrative: true },
      });

      const pdf = await renderReportPdf({
        report,
        userName: request.auth!.fullName,
        narrative: stored?.narrative ?? null,
      });

      await recordAudit({
        userId,
        action: AuditAction.REPORT_GENERATED,
        resource: 'monthly_report',
        resourceId: month,
        metadata: { month, format: 'pdf', bytes: pdf.length },
        request,
      });

      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `attachment; filename="flowmoney-${month}.pdf"`)
        .send(pdf);
    },
  });

  app.get('/reports/monthly/:month/pdf', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_REPORTS)],
    handler: async (request, reply) => {
      const month = monthKey.parse((request.params as { month: string }).month);
      const report = await generateMonthlyReport(request.auth!.userId, month);
      const pdf = await renderReportPdf({
        report,
        userName: request.auth!.fullName,
        narrative: null,
      });
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `inline; filename="flowmoney-${month}.pdf"`)
        .send(pdf);
    },
  });

  app.get('/reports/health-trend', {
    preHandler: [app.requirePermission(Permission.VIEW_OWN_FINANCIAL_HEALTH)],
    handler: async (request) => {
      const rows = await prisma.financialHealthScore.findMany({
        where: { userId: request.auth!.userId },
        orderBy: { month: 'asc' },
        select: { month: true, score: true, riskLevel: true },
      });
      if (rows.length === 0) throw notFound('Health history');
      return {
        trend: rows.map((row) => ({
          month: row.month,
          score: Number(row.score),
          riskLevel: row.riskLevel,
        })),
      };
    },
  });
}
