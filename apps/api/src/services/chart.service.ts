import { Resvg } from '@resvg/resvg-js';
import { formatINR } from '@flowmoney/shared-types';
import type { BudgetStatus, FinancialHealth, PurchaseDecision } from '@flowmoney/shared-types';

/**
 * Renders financial data as PNG chart images for WhatsApp, where a wall of
 * numbers reads badly but an image doesn't cost anything extra to look at.
 * Charts are hand-built SVG (no charting library — these are simple enough
 * that one isn't worth the dependency weight) rendered to PNG via resvg,
 * which ships prebuilt native binaries so it needs no toolchain in Docker.
 *
 * Palette matches the web dashboard's design tokens (see apps/web globals.css)
 * so a chart looks like it came from the same product whichever channel it's
 * viewed on.
 */

const COLORS = {
  bg: '#0f1222',
  card: '#171a2e',
  border: '#2a2e47',
  text: '#f1f2f8',
  muted: '#9498b3',
  primary: '#6366f1',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
} as const;

const VERDICT_COLOR: Record<string, string> = {
  SMART_BUY: COLORS.success,
  AFFORDABLE_BUT_CAUTION: COLORS.warning,
  WAIT_AND_SAVE: COLORS.warning,
  NOT_RECOMMENDED: COLORS.danger,
};

const VERDICT_LABEL: Record<string, string> = {
  SMART_BUY: 'Smart Buy',
  AFFORDABLE_BUT_CAUTION: 'Caution',
  WAIT_AND_SAVE: 'Wait & Save',
  NOT_RECOMMENDED: 'Not Recommended',
};

const RISK_COLOR: Record<string, string> = {
  LOW: COLORS.success,
  MODERATE: COLORS.warning,
  HIGH: COLORS.danger,
  CRITICAL: COLORS.danger,
};

function scoreColor(score: number): string {
  if (score >= 80) return COLORS.success;
  if (score >= 60) return COLORS.primary;
  if (score >= 40) return COLORS.warning;
  return COLORS.danger;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Renders an SVG document to a PNG buffer at 2x for crisp mobile display. */
function toPng(svg: string, width: number, height: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width * 2 },
    font: { loadSystemFonts: true },
  });
  return Buffer.from(resvg.render().asPng());
}

function svgDocument(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">
<rect width="${width}" height="${height}" fill="${COLORS.bg}"/>
${body}
</svg>`;
}

/** A horizontal progress bar with a label above and a value on the right. */
function progressBar(args: {
  x: number;
  y: number;
  width: number;
  label: string;
  valueText: string;
  percent: number;
  color: string;
  height?: number;
}): string {
  const barHeight = args.height ?? 14;
  const pct = Math.max(0, Math.min(100, args.percent));
  const filled = (pct / 100) * args.width;
  return `
<text x="${args.x}" y="${args.y}" fill="${COLORS.text}" font-size="15" font-weight="600">${escapeXml(args.label)}</text>
<text x="${args.x + args.width}" y="${args.y}" fill="${COLORS.muted}" font-size="14" text-anchor="end">${escapeXml(args.valueText)}</text>
<rect x="${args.x}" y="${args.y + 10}" width="${args.width}" height="${barHeight}" rx="${barHeight / 2}" fill="${COLORS.border}"/>
<rect x="${args.x}" y="${args.y + 10}" width="${Math.max(barHeight, filled)}" height="${barHeight}" rx="${barHeight / 2}" fill="${args.color}"/>`;
}

/** A ring gauge for a 0-100 score, centered at (cx, cy). */
function scoreRing(cx: number, cy: number, radius: number, score: number, color: string): string {
  const stroke = 14;
  const r = radius - stroke / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  return `
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${COLORS.border}" stroke-width="${stroke}"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
  stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})"/>
<text x="${cx}" y="${cy + 10}" fill="${COLORS.text}" font-size="34" font-weight="700" text-anchor="middle">${Math.round(score)}</text>
<text x="${cx}" y="${cy + 30}" fill="${COLORS.muted}" font-size="12" text-anchor="middle">/ 100</text>`;
}

function footer(width: number, height: number, text: string): string {
  return `<text x="${width / 2}" y="${height - 16}" fill="${COLORS.muted}" font-size="11" text-anchor="middle">${escapeXml(text)}</text>`;
}

// ------------------------------------------------------------------ purchase

export function renderPurchaseChart(decision: PurchaseDecision): Buffer {
  const width = 640;
  const height = 520;
  const color = VERDICT_COLOR[decision.verdict] ?? COLORS.primary;
  const label = VERDICT_LABEL[decision.verdict] ?? decision.verdict;

  const barsX = 40;
  const barsWidth = width - 80;
  const remainingAfter = decision.discretionaryBudgetAfter;
  // Price and budget bars share a scale so their filled length is directly
  // comparable at a glance — a bar chart, not two independent gauges.
  const comparisonMax = Math.max(decision.purchasePrice, decision.discretionaryBudgetRemaining, 1);

  const body = `
<rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="20" fill="${COLORS.card}" stroke="${COLORS.border}"/>
${scoreRing(width / 2, 150, 90, decision.score, color)}
<rect x="${width / 2 - 90}" y="250" width="180" height="34" rx="17" fill="${color}22" stroke="${color}"/>
<text x="${width / 2}" y="273" fill="${color}" font-size="16" font-weight="700" text-anchor="middle">${escapeXml(label.toUpperCase())}</text>

${progressBar({
  x: barsX,
  y: 330,
  width: barsWidth,
  label: 'Purchase price',
  valueText: formatINR(decision.purchasePrice),
  percent: (decision.purchasePrice / comparisonMax) * 100,
  color: COLORS.muted,
})}
${progressBar({
  x: barsX,
  y: 380,
  width: barsWidth,
  label: 'Discretionary budget left',
  valueText: formatINR(decision.discretionaryBudgetRemaining),
  percent: (decision.discretionaryBudgetRemaining / comparisonMax) * 100,
  color: COLORS.primary,
})}
${progressBar({
  x: barsX,
  y: 430,
  width: barsWidth,
  label: remainingAfter >= 0 ? 'Remaining after purchase' : 'Shortfall after purchase',
  valueText: formatINR(Math.abs(remainingAfter)),
  percent: remainingAfter >= 0 ? Math.min(100, (remainingAfter / Math.max(decision.discretionaryBudgetRemaining, 1)) * 100) : 100,
  color: remainingAfter >= 0 ? COLORS.success : COLORS.danger,
})}
${footer(width, height, 'FlowMoney AI · deterministic purchase engine')}`;

  return toPng(svgDocument(width, height, body), width, height);
}

// -------------------------------------------------------------------- budget

export function renderBudgetChart(status: BudgetStatus): Buffer {
  const rows = [...status.categories]
    .filter((c) => c.allocated > 0 || c.spent > 0)
    .sort((a, b) => b.utilisationPercent - a.utilisationPercent)
    .slice(0, 6);

  const width = 640;
  const rowHeight = 58;
  const headerHeight = 130;
  const height = headerHeight + rows.length * rowHeight + 60;
  const barsX = 40;
  const barsWidth = width - 80;

  const adherenceColor =
    status.adherencePercent >= 85 ? COLORS.success : status.adherencePercent >= 60 ? COLORS.warning : COLORS.danger;

  const header = `
<rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="20" fill="${COLORS.card}" stroke="${COLORS.border}"/>
<text x="40" y="66" fill="${COLORS.text}" font-size="20" font-weight="700">Budget check-in</text>
<text x="40" y="90" fill="${COLORS.muted}" font-size="14">${escapeXml(formatINR(status.totalSpent))} spent of ${escapeXml(formatINR(status.totalAllocated))} planned</text>
<text x="${width - 40}" y="66" fill="${adherenceColor}" font-size="22" font-weight="700" text-anchor="end">${Math.round(status.adherencePercent)}%</text>
<text x="${width - 40}" y="90" fill="${COLORS.muted}" font-size="13" text-anchor="end">adherence</text>
<line x1="40" y1="108" x2="${width - 40}" y2="108" stroke="${COLORS.border}"/>`;

  const rowsSvg = rows
    .map((c, i) => {
      const y = headerHeight + i * rowHeight;
      const over = c.utilisationPercent > 100;
      const color = over ? COLORS.danger : c.utilisationPercent > 85 ? COLORS.warning : COLORS.primary;
      return progressBar({
        x: barsX,
        y: y + 20,
        width: barsWidth,
        label: c.categoryLabel,
        valueText: `${formatINR(c.spent)} / ${formatINR(c.allocated)}`,
        percent: c.utilisationPercent,
        color,
      });
    })
    .join('\n');

  const body = `${header}${rowsSvg}${footer(width, height, `Safe daily spend: ${formatINR(status.safeDailySpend)} · ${status.daysRemaining} days left`)}`;
  return toPng(svgDocument(width, height, body), width, height);
}

// -------------------------------------------------------------------- health

export function renderHealthChart(health: FinancialHealth): Buffer {
  const width = 640;
  const rowHeight = 52;
  const headerHeight = 260;
  const height = headerHeight + health.components.length * rowHeight + 60;
  const barsX = 40;
  const barsWidth = width - 80;
  const color = scoreColor(health.score);
  const riskColor = RISK_COLOR[health.riskLevel] ?? COLORS.muted;

  const header = `
<rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="20" fill="${COLORS.card}" stroke="${COLORS.border}"/>
${scoreRing(width / 2, 150, 90, health.score, color)}
<rect x="${width / 2 - 80}" y="250" width="160" height="30" rx="15" fill="${riskColor}22" stroke="${riskColor}"/>
<text x="${width / 2}" y="270" fill="${riskColor}" font-size="14" font-weight="700" text-anchor="middle">${escapeXml(health.riskLevel)} RISK</text>`;

  const rowsSvg = health.components
    .map((c, i) => {
      const y = headerHeight + 40 + i * rowHeight;
      const pct = (c.score / c.maxScore) * 100;
      return progressBar({
        x: barsX,
        y,
        width: barsWidth,
        label: c.label,
        valueText: `${Math.round(c.score)}/${c.maxScore}`,
        percent: pct,
        color: pct >= 75 ? COLORS.success : pct >= 50 ? COLORS.primary : pct >= 25 ? COLORS.warning : COLORS.danger,
      });
    })
    .join('\n');

  const body = `${header}${rowsSvg}${footer(width, height, 'FlowMoney AI · financial health score')}`;
  return toPng(svgDocument(width, height, body), width, height);
}
