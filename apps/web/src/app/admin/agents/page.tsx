'use client';

import { useMemo, useState } from 'react';
import { Bot, Plus, Trash2, X } from 'lucide-react';
import { AgentOutputFormat, Permission, PERMISSION_GROUPS } from '@flowmoney/shared-types';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Modal } from '@/components/admin/modal';
import { PermissionPicker } from '@/components/admin/permission-picker';
import { useApi } from '@/hooks/use-api';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/hooks/use-session';
import { cn } from '@/lib/utils';

interface AgentRow {
  id: string;
  key: string;
  name: string;
  description: string;
  systemInstructions: string;
  outputFormat: string;
  handledIntents: string[];
  requiredPermissions: string[];
  allowedTools: string[];
  temperature: number;
  maxTokens: number;
  model: string | null;
  isEnabled: boolean;
  isSystem: boolean;
  priority: number;
  usage: { conversations: number; messages: number };
  updatedAt: string;
}

interface ToolInfo {
  name: string;
  description: string;
  requiredPermissions: string[];
  mutating: boolean;
}

interface AgentFormState {
  key: string;
  name: string;
  description: string;
  systemInstructions: string;
  allowedTools: string[];
  requiredPermissions: string[];
  outputFormat: string;
  handledIntents: string[];
  temperature: number;
  maxTokens: number;
  model: string;
  isEnabled: boolean;
  priority: number;
}

const OUTPUT_FORMATS = Object.values(AgentOutputFormat);

const EMPTY_FORM: AgentFormState = {
  key: '',
  name: '',
  description: '',
  systemInstructions: '',
  allowedTools: [],
  requiredPermissions: [],
  outputFormat: AgentOutputFormat.CONVERSATIONAL,
  handledIntents: [],
  temperature: 0.3,
  maxTokens: 900,
  model: '',
  isEnabled: true,
  priority: 100,
};

export default function AdminAgentsPage() {
  const { hasPermission } = useSession();
  const canManage = hasPermission(Permission.MANAGE_AGENTS);

  const agents = useApi<{ agents: AgentRow[] }>('/admin/agents');
  const tools = useApi<{ tools: ToolInfo[] }>('/admin/tools');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentRow | null>(null);
  const [form, setForm] = useState<AgentFormState>(EMPTY_FORM);
  const [intentDraft, setIntentDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const toolsByGroup = useMemo(() => {
    const list = tools.data?.tools ?? [];
    return {
      'Read-only tools': list.filter((t) => !t.mutating).map((t) => t.name),
      'Mutating tools': list.filter((t) => t.mutating).map((t) => t.name),
    };
  }, [tools.data]);

  const toolMeta = useMemo(() => {
    const map: Record<string, { key: string; name: string; description?: string }> = {};
    for (const t of tools.data?.tools ?? []) {
      map[t.name] = { key: t.name, name: t.name, description: t.description };
    }
    return map;
  }, [tools.data]);

  function openCreate() {
    setEditingAgent(null);
    setForm(EMPTY_FORM);
    setIntentDraft('');
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(agent: AgentRow) {
    setEditingAgent(agent);
    setForm({
      key: agent.key,
      name: agent.name,
      description: agent.description,
      systemInstructions: agent.systemInstructions,
      allowedTools: agent.allowedTools,
      requiredPermissions: agent.requiredPermissions,
      outputFormat: agent.outputFormat,
      handledIntents: agent.handledIntents,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      model: agent.model ?? '',
      isEnabled: agent.isEnabled,
      priority: agent.priority,
    });
    setIntentDraft('');
    setFormError(null);
    setModalOpen(true);
  }

  function addIntent() {
    const value = intentDraft.trim().toUpperCase().replace(/\s+/g, '_');
    if (!value || form.handledIntents.includes(value)) return;
    setForm((f) => ({ ...f, handledIntents: [...f.handledIntents, value] }));
    setIntentDraft('');
  }

  function removeIntent(value: string) {
    setForm((f) => ({ ...f, handledIntents: f.handledIntents.filter((v) => v !== value) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const body = {
      name: form.name,
      description: form.description,
      systemInstructions: form.systemInstructions,
      allowedTools: form.allowedTools,
      requiredPermissions: form.requiredPermissions,
      outputFormat: form.outputFormat,
      handledIntents: form.handledIntents,
      temperature: form.temperature,
      maxTokens: form.maxTokens,
      model: form.model.trim() || null,
      isEnabled: form.isEnabled,
      priority: form.priority,
    };
    try {
      if (editingAgent) {
        await api.patch(`/admin/agents/${editingAgent.id}`, body);
      } else {
        await api.post('/admin/agents', { ...body, key: form.key.trim().toUpperCase() });
      }
      setModalOpen(false);
      agents.refetch();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save agent');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAgent(agent: AgentRow) {
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
    setDeletingId(agent.id);
    setListError(null);
    try {
      await api.delete(`/admin/agents/${agent.id}`);
      agents.refetch();
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Could not delete agent');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Agents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the agents that power FlowMoney AI conversations — instructions, tools, and guardrails.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New agent
          </Button>
        )}
      </div>

      {listError && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {listError}
        </div>
      )}

      {agents.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : agents.error ? (
        <ErrorState message={agents.error} retry={agents.refetch} />
      ) : (agents.data?.agents.length ?? 0) === 0 ? (
        <EmptyState icon={Bot} title="No agents configured" description="Create your first AI agent to get started." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.data?.agents.map((agent) => (
            <div key={agent.id} className="surface flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{agent.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{agent.key}</p>
                </div>
                <Badge tone={agent.isEnabled ? 'success' : 'neutral'}>{agent.isEnabled ? 'Enabled' : 'Disabled'}</Badge>
              </div>
              {agent.description && <p className="line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>}
              <div className="flex flex-wrap gap-1.5">
                {agent.isSystem && <Badge tone="primary">System</Badge>}
                <Badge tone="neutral">{agent.allowedTools.length} tool(s)</Badge>
                <Badge tone="neutral">{agent.outputFormat}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {agent.usage.conversations} conversations · {agent.usage.messages} messages
              </p>
              {canManage && (
                <div className="mt-auto flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(agent)}>
                    Edit
                  </Button>
                  {!agent.isSystem && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      loading={deletingId === agent.id}
                      onClick={() => void deleteAgent(agent)}
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
        title={editingAgent ? `Edit ${editingAgent.name}` : 'New agent'}
        className="max-w-3xl"
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!editingAgent && (
              <div>
                <Label htmlFor="agent-key">Key (UPPER_SNAKE_CASE)</Label>
                <Input
                  id="agent-key"
                  required
                  value={form.key}
                  onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                  placeholder="STUDENT_FINANCIAL_COACH"
                  pattern="[A-Za-z0-9_]+"
                />
              </div>
            )}
            <div>
              <Label htmlFor="agent-name">Name</Label>
              <Input
                id="agent-name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Student Financial Coach"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="agent-description">Description</Label>
            <Input
              id="agent-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Helps university students manage irregular expenses and limited income."
            />
          </div>

          <div>
            <Label htmlFor="agent-instructions">System instructions</Label>
            <Textarea
              id="agent-instructions"
              required
              minLength={20}
              rows={6}
              value={form.systemInstructions}
              onChange={(e) => setForm((f) => ({ ...f, systemInstructions: e.target.value }))}
              placeholder="You specialize in helping university students manage irregular expenses, food spending, subscriptions, and limited income. Always ground recommendations in the customer's real transaction data…"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="agent-output-format">Output format</Label>
              <Select
                id="agent-output-format"
                value={form.outputFormat}
                onChange={(e) => setForm((f) => ({ ...f, outputFormat: e.target.value }))}
              >
                {OUTPUT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="agent-temperature">Temperature</Label>
              <Input
                id="agent-temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={form.temperature}
                onChange={(e) => setForm((f) => ({ ...f, temperature: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label htmlFor="agent-max-tokens">Max tokens</Label>
              <Input
                id="agent-max-tokens"
                type="number"
                min={64}
                max={8000}
                value={form.maxTokens}
                onChange={(e) => setForm((f) => ({ ...f, maxTokens: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label htmlFor="agent-priority">Priority</Label>
              <Input
                id="agent-priority"
                type="number"
                min={0}
                max={1000}
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="agent-model">Model override (optional)</Label>
            <Input
              id="agent-model"
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              placeholder="Leave blank to use the platform default"
            />
          </div>

          <div>
            <Label htmlFor="agent-intent-draft">Handled intents</Label>
            <div className="flex gap-2">
              <Input
                id="agent-intent-draft"
                value={intentDraft}
                onChange={(e) => setIntentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addIntent();
                  }
                }}
                placeholder="BUDGET_MANAGEMENT"
              />
              <Button type="button" variant="outline" onClick={addIntent}>
                Add
              </Button>
            </div>
            {form.handledIntents.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.handledIntents.map((intent) => (
                  <Badge key={intent} tone="neutral" className="gap-1.5">
                    {intent}
                    <button type="button" onClick={() => removeIntent(intent)} aria-label={`Remove ${intent}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>Allowed tools</Label>
            {tools.loading ? (
              <div className="h-32 animate-pulse rounded-md bg-muted" />
            ) : (
              <PermissionPicker
                groups={toolsByGroup}
                metaByKey={toolMeta}
                selected={form.allowedTools}
                onChange={(next) => setForm((f) => ({ ...f, allowedTools: next }))}
              />
            )}
          </div>

          <div>
            <Label>Required permissions</Label>
            <PermissionPicker
              groups={PERMISSION_GROUPS}
              selected={form.requiredPermissions}
              onChange={(next) => setForm((f) => ({ ...f, requiredPermissions: next }))}
            />
          </div>

          <label className={cn('flex items-center gap-2 text-sm')}>
            <input
              type="checkbox"
              checked={form.isEnabled}
              onChange={(e) => setForm((f) => ({ ...f, isEnabled: e.target.checked }))}
              className="h-4 w-4 accent-primary"
            />
            Enabled
          </label>

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
              {editingAgent ? 'Save changes' : 'Create agent'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
