import type { LucideIcon } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const IconComp = Icon ?? AlertTriangle;
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-14 text-center',
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <IconComp className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 py-10 text-center">
      <AlertTriangle className="h-5 w-5 text-destructive" />
      <p className="max-w-sm text-sm text-destructive">{message}</p>
      {retry && (
        <button onClick={retry} className="text-sm font-medium text-primary hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}
