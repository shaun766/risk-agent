import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, formatDate, VERDICT_STYLES } from '@/lib/format';
import { ListTree } from 'lucide-react';

interface Row {
  id: string;
  description: string | null;
  merchant: string | null;
  categoryKey: string;
  price: number;
  verdict: string;
  score: number;
  createdAt: string;
}

export function PurchaseHistoryTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ListTree}
        title="No purchase decisions yet"
        description="Ask FlowMoney AI or the purchase simulator whether you can afford something — it will show up here."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Item</th>
            <th className="pb-2 pr-4 font-medium">Price</th>
            <th className="pb-2 pr-4 font-medium">Verdict</th>
            <th className="pb-2 pr-4 font-medium">Score</th>
            <th className="pb-2 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const style = VERDICT_STYLES[row.verdict] ?? { label: row.verdict, tone: 'neutral' as const };
            return (
              <tr key={row.id} className="border-b border-border/60 last:border-0">
                <td className="py-2.5 pr-4">
                  <p className="font-medium">{row.merchant || row.description || row.categoryKey}</p>
                  <p className="text-xs capitalize text-muted-foreground">{row.categoryKey}</p>
                </td>
                <td className="py-2.5 pr-4 tabular">{formatCurrency(row.price)}</td>
                <td className="py-2.5 pr-4">
                  <Badge tone={style.tone}>{style.label}</Badge>
                </td>
                <td className="py-2.5 pr-4 tabular font-medium">{Math.round(row.score)}/100</td>
                <td className="py-2.5 text-muted-foreground">{formatDate(row.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
