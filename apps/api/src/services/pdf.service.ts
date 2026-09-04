import type { MonthlyReportData } from '@flowmoney/shared-types';
import { formatINR } from '@flowmoney/shared-types';
import PDFDocument from 'pdfkit';

export interface RenderReportInput {
  report: MonthlyReportData;
  userName: string;
  narrative: string | null;
}

const INK = '#0f172a';
const MUTED = '#64748b';
const ACCENT = '#4f46e5';
const RULE = '#e2e8f0';

/**
 * Renders the monthly report to PDF.
 *
 * pdfkit is used rather than headless Chrome so the export has no browser
 * dependency and runs identically in a container, a worker or a CI job.
 */
export async function renderReportPdf(input: RenderReportInput): Promise<Buffer> {
  const { report, userName, narrative } = input;

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const heading = (text: string) => {
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.moveDown(0.8);
      doc.fillColor(ACCENT).fontSize(13).font('Helvetica-Bold').text(text.toUpperCase(), { characterSpacing: 0.6 });
      doc.moveDown(0.3);
      doc
        .strokeColor(RULE)
        .lineWidth(1)
        .moveTo(doc.x, doc.y)
        .lineTo(doc.x + pageWidth, doc.y)
        .stroke();
      doc.moveDown(0.5);
      doc.fillColor(INK).font('Helvetica').fontSize(10);
    };

    const row = (label: string, value: string, emphasis = false) => {
      const y = doc.y;
      doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(label, doc.x, y, { width: pageWidth * 0.6 });
      doc
        .fillColor(emphasis ? ACCENT : INK)
        .font(emphasis ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(10)
        .text(value, doc.x + pageWidth * 0.6, y, { width: pageWidth * 0.4, align: 'right' });
      doc.moveDown(0.35);
    };

    // ---------------------------------------------------------------- header
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(22).text('FlowMoney AI');
    doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('Monthly financial report');
    doc.moveDown(0.8);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(`${userName} · ${report.month}`);
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .text(
        `${report.periodStart.slice(0, 10)} to ${report.periodEnd.slice(0, 10)} · generated ${new Date(report.computedAt).toISOString().slice(0, 10)} · engine v${report.engineVersion}`,
      );

    // ------------------------------------------------------------- overview
    heading('Financial overview');
    row('Income', formatINR(report.overview.income));
    row('Total spending', formatINR(report.overview.totalSpending));
    row('Saved', `${formatINR(report.overview.savings)} (${report.overview.savingsRatePercent}%)`, true);
    row('Invested', formatINR(report.overview.investments));
    row('Net cash flow', formatINR(report.overview.netCashFlow));
    if (report.previousMonth) {
      const delta = report.overview.totalSpending - report.previousMonth.totalSpending;
      row(
        'Versus previous month',
        `${delta >= 0 ? '+' : '−'}${formatINR(Math.abs(delta))} spending`,
      );
    }

    // ------------------------------------------------------- spending split
    heading('Spending breakdown');
    for (const category of report.spendingBreakdown.filter((c) => c.spent > 0).slice(0, 12)) {
      const share = report.overview.totalSpending
        ? Math.round((category.spent / report.overview.totalSpending) * 100)
        : 0;
      const y = doc.y;
      doc.fillColor(INK).fontSize(10).text(category.categoryLabel, doc.x, y, { width: pageWidth * 0.4 });
      // Inline bar so the proportions are readable without a chart library.
      const barWidth = Math.max(2, (pageWidth * 0.3 * share) / 100);
      doc.rect(doc.x + pageWidth * 0.42, y + 2, pageWidth * 0.3, 7).fillColor(RULE).fill();
      doc.rect(doc.x + pageWidth * 0.42, y + 2, barWidth, 7).fillColor(ACCENT).fill();
      doc
        .fillColor(INK)
        .fontSize(10)
        .text(`${formatINR(category.spent)} (${share}%)`, doc.x + pageWidth * 0.74, y, {
          width: pageWidth * 0.26,
          align: 'right',
        });
      doc.moveDown(0.4);
    }

    // ---------------------------------------------------- budget performance
    if (report.budgetPerformance) {
      heading('Budget performance');
      const budget = report.budgetPerformance;
      row('Planned', formatINR(budget.totalAllocated));
      row('Actual', formatINR(budget.totalSpent));
      row('Adherence', `${budget.adherencePercent}%`, true);
      row('Projected month-end spend', formatINR(budget.projectedMonthEndSpend));
      if (budget.ruleViolations.length > 0) {
        doc.moveDown(0.2);
        for (const violation of budget.ruleViolations) {
          doc
            .fillColor('#b91c1c')
            .fontSize(9)
            .text(
              `• ${violation.label}: ${formatINR(violation.actual)} against a ${formatINR(violation.limit)} limit`,
            );
        }
        doc.fillColor(INK);
      }
    }

    // ------------------------------------------------------------- insights
    if (report.insights.length > 0) {
      heading('Behavioural insights');
      for (const insight of report.insights.slice(0, 6)) {
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(insight.headline);
        doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(insight.detail);
        doc.moveDown(0.4);
      }
    }

    // --------------------------------------------------------------- health
    heading('Financial health');
    row('Score', `${report.health.score} / 100 (${report.health.riskLevel.toLowerCase()} risk)`, true);
    for (const component of report.health.components) {
      row(component.label, `${component.score} / ${component.maxScore}`);
    }

    // ------------------------------------------------------------- savings
    heading('Savings performance');
    row('Target', formatINR(report.savingsPerformance.target));
    row('Actual', formatINR(report.savingsPerformance.actual), true);
    row('Achieved', `${report.savingsPerformance.achievedPercent}%`);
    if (report.savingsPerformance.shortfall > 0) {
      row('Shortfall', formatINR(report.savingsPerformance.shortfall));
    }

    // --------------------------------------------------- purchase decisions
    if (report.purchaseDecisions.length > 0) {
      heading('Purchase decisions');
      for (const decision of report.purchaseDecisions.slice(0, 8)) {
        row(
          `${decision.description} · ${formatINR(decision.price)}`,
          `${decision.verdict.replace(/_/g, ' ')} · ${decision.score}/100`,
        );
      }
    }

    // ------------------------------------------------------ recommendations
    if (report.recommendations.length > 0) {
      heading('Recommendations');
      for (const recommendation of report.recommendations) {
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(recommendation.title);
        doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(recommendation.detail);
        doc
          .fillColor(ACCENT)
          .fontSize(9)
          .text(`Estimated impact: ${formatINR(recommendation.impact)}`);
        doc.moveDown(0.4);
      }
    }

    // ------------------------------------------------------------- forecast
    heading('Next month forecast');
    row('Projected spending', formatINR(report.forecast.projectedSpending));
    row('Projected savings', formatINR(report.forecast.projectedSavings));
    row('Projected balance', formatINR(report.forecast.projectedBalance));
    doc.moveDown(0.2);
    doc.fillColor(MUTED).fontSize(8).text(report.forecast.basis);

    if (narrative) {
      heading('Summary');
      doc.fillColor(INK).fontSize(10).text(narrative, { align: 'left', lineGap: 2 });
    }

    // --------------------------------------------------------------- footer
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      doc
        .fillColor(MUTED)
        .fontSize(8)
        .text(
          `FlowMoney AI · generated from your own transaction data · page ${i + 1} of ${range.count}`,
          doc.page.margins.left,
          doc.page.height - 32,
          { width: pageWidth, align: 'center' },
        );
    }

    doc.end();
  });
}
