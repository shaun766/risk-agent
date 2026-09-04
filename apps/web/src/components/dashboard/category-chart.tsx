'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompact, formatCurrency } from '@/lib/format';
import type { CategorySpend } from '@/lib/types';

export function CategoryChart({ data }: { data: CategorySpend[] }) {
  const top = [...data]
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 8);

  if (top.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No spending recorded yet</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis type="number" tickFormatter={(v: number) => formatCompact(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="categoryLabel"
          width={110}
          tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          contentStyle={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="spent" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {top.map((entry) => (
            <Cell
              key={entry.categoryKey}
              fill={entry.categoryKind === 'ESSENTIAL' ? 'hsl(var(--primary))' : 'hsl(200 90% 55%)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
