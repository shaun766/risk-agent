'use client';

import { useMemo, useState } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Permission } from '@flowmoney/shared-types';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Modal } from '@/components/admin/modal';
import { PermissionPicker, type PermissionMeta } from '@/components/admin/permission-picker';
import { useApi } from '@/hooks/use-api';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/hooks/use-session';

interface PermissionInfo {
  key: string;
  name: string;
  group: string;
  description: string;
}

interface PermissionsResponse {
  permissions: PermissionInfo[];
  groups: Record<string, string[]>;
  all: string[];
}

interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

interface RoleFormState {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

const EMPTY_FORM: RoleFormState = { key: '', name: '', description: '', permissions: [] };

export default function AdminRolesPage() {
  const { hasPermission } = useSession();
  const canManage = hasPermission(Permission.MANAGE_ROLES);

  const permissionsQuery = useApi<PermissionsResponse>('/admin/permissions');
  const roles = useApi<{ roles: RoleRow[] }>('/admin/roles');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [form, setForm] = useState<RoleFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const metaByKey = useMemo(() => {
    const map: Record<string, PermissionMeta> = {};
    for (const p of permissionsQuery.data?.permissions ?? []) {
      map[p.key] = { key: p.key, name: p.name, description: p.description };
    }
    return map;
  }, [permissionsQuery.data]);

  function openCreate() {
    setEditingRole(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(role: RoleRow) {
    setEditingRole(role);
    setForm({ key: role.key, name: role.name, description: role.description, permissions: role.permissions });
    setFormError(null);
    setModalOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editingRole) {
        const body: { name: string; description: string; permissions?: string[] } = {
          name: form.name,
          description: form.description,
        };
        if (!editingRole.isSystem) body.permissions = form.permissions;
        await api.patch(`/admin/roles/${editingRole.id}`, body);
      } else {
        await api.post('/admin/roles', {
          key: form.key.trim().toUpperCase(),
          name: form.name,
          description: form.description,
          permissions: form.permissions,
        });
      }
      setModalOpen(false);
      roles.refetch();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save role');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(role: RoleRow) {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    setDeletingId(role.id);
    setListError(null);
    try {
      await api.delete(`/admin/roles/${role.id}`);
      roles.refetch();
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Could not delete role');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roles &amp; Permissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Build custom roles from the platform&apos;s permission atoms.</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New role
          </Button>
        )}
      </div>

      {listError && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {listError}
        </div>
      )}

      {roles.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : roles.error ? (
        <ErrorState message={roles.error} retry={roles.refetch} />
      ) : (roles.data?.roles.length ?? 0) === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No roles yet"
          description="Create your first custom role to get started."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {roles.data?.roles.map((role) => (
            <div key={role.id} className="surface flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{role.name}</p>
                    {role.isSystem && <Badge tone="primary">System</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{role.key}</p>
                </div>
                <Badge tone="neutral">{role.userCount} user{role.userCount === 1 ? '' : 's'}</Badge>
              </div>
              {role.description && <p className="text-sm text-muted-foreground">{role.description}</p>}
              <p className="text-xs text-muted-foreground">{role.permissions.length} permission(s) granted</p>
              {canManage && (
                <div className="mt-auto flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(role)}>
                    Edit
                  </Button>
                  {!role.isSystem && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      loading={deletingId === role.id}
                      disabled={role.userCount > 0}
                      title={role.userCount > 0 ? 'Cannot delete a role with assigned users' : undefined}
                      onClick={() => void deleteRole(role)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editingRole ? `Edit ${editingRole.name}` : 'New role'}
        description={editingRole?.isSystem ? 'System roles: name and description only — permissions are fixed.' : undefined}
      >
        <form onSubmit={submit} className="space-y-4">
          {!editingRole && (
            <div>
              <Label htmlFor="role-key">Key (UPPER_SNAKE_CASE)</Label>
              <Input
                id="role-key"
                required
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                placeholder="PREMIUM_WEALTH_ADVISOR"
                pattern="[A-Za-z0-9_]+"
              />
            </div>
          )}
          <div>
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Premium Wealth Advisor"
            />
          </div>
          <div>
            <Label htmlFor="role-description">Description</Label>
            <Textarea
              id="role-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Advises high-net-worth customers on portfolio allocation."
            />
          </div>
          <div>
            <Label>Permissions</Label>
            {permissionsQuery.loading ? (
              <div className="h-40 animate-pulse rounded-md bg-muted" />
            ) : (
              <PermissionPicker
                groups={permissionsQuery.data?.groups ?? {}}
                metaByKey={metaByKey}
                selected={form.permissions}
                onChange={(next) => setForm((f) => ({ ...f, permissions: next }))}
                disabled={Boolean(editingRole?.isSystem)}
              />
            )}
          </div>

          {formError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editingRole ? 'Save changes' : 'Create role'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
