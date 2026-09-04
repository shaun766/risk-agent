'use client';

import { cn } from '@/lib/utils';

function toneFor(score: number): { stroke: string; text: string } {
  if (score >= 80) return { stroke: 'hsl(var(--success))', text: 'text-success' };
  if (score >= 60) return { stroke: 'hsl(var(--primary))', text: 'text-primary' };
  if (score >= 40) return { stroke: 'hsl(var(--warning))', text: 'text-warning' };
  return { stroke: 'hsl(var(--destructive))', text: 'text-destructive' };
}

export function ScoreRing({
  score,
  size = 120,
  strokeWidth = 10,
  label,
  className,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const tone = toneFor(clamped);

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('tabular text-3xl font-bold leading-none', tone.text)}>{Math.round(clamped)}</span>
        <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label ?? '/ 100'}</span>
      </div>
    </div>
  );
}
