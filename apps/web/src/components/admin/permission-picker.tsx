'use client';

import { cn } from '@/lib/utils';

export interface PermissionMeta {
  key: string;
  name: string;
  description?: string;
}

/**
 * Grouped checkbox picker for permission keys. Accepts either the raw
 * `PERMISSION_GROUPS` shape (group -> string[]) or the richer `/admin/permissions`
 * response (group -> PermissionMeta[]) via `metaByKey`.
 */
export function PermissionPicker({
  groups,
  metaByKey,
  selected,
  onChange,
  disabled,
}: {
  groups: Record<string, string[]>;
  metaByKey?: Record<string, PermissionMeta>;
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  function toggle(key: string) {
    if (disabled) return;
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  }

  return (
    <div className="max-h-80 space-y-4 overflow-y-auto rounded-md border border-border p-3">
      {Object.entries(groups).map(([group, keys]) => (
        <div key={group}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {keys.map((key) => {
              const meta = metaByKey?.[key];
              return (
                <label
                  key={key}
                  className={cn(
                    'flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                    !disabled && 'cursor-pointer hover:bg-accent/60',
                  )}
                  title={meta?.description}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(key)}
                    onChange={() => toggle(key)}
                    disabled={disabled}
                    className="mt-0.5 h-4 w-4 accent-primary disabled:opacity-50"
                  />
                  <span className={disabled ? 'text-muted-foreground' : ''}>{meta?.name ?? key}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
