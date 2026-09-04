'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { AppShell } from '@/components/layout/app-shell';
import { AuthGuard } from '@/components/layout/auth-guard';
import { CUSTOMER_NAV } from '@/components/layout/nav-config';
import { useSession } from '@/hooks/use-session';
import { api, ApiError } from '@/lib/api';

function SettingsForm() {
  const { user, refresh } = useSession();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [occupation, setOccupation] = useState(user?.profile?.occupation ?? '');
  const [city, setCity] = useState(user?.profile?.city ?? '');
  const [income, setIncome] = useState(user?.profile?.declaredMonthlyIncome?.toString() ?? '');
  const [emergencyMonths, setEmergencyMonths] = useState(
    user?.profile?.emergencyFundTargetMonths?.toString() ?? '6',
  );
  const [whatsappOptIn, setWhatsappOptIn] = useState(user?.profile?.whatsappOptIn ?? false);
  const [voiceReplies, setVoiceReplies] = useState(user?.profile?.voiceRepliesEnabled ?? true);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName);
    setOccupation(user.profile?.occupation ?? '');
    setCity(user.profile?.city ?? '');
    setIncome(user.profile?.declaredMonthlyIncome?.toString() ?? '');
    setEmergencyMonths(user.profile?.emergencyFundTargetMonths?.toString() ?? '6');
    setWhatsappOptIn(user.profile?.whatsappOptIn ?? false);
    setVoiceReplies(user.profile?.voiceRepliesEnabled ?? true);
  }, [user]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch('/auth/profile', {
        fullName,
        occupation: occupation || null,
        city: city || null,
        declaredMonthlyIncome: income ? Number(income) : null,
        emergencyFundTargetMonths: emergencyMonths ? Number(emergencyMonths) : undefined,
        whatsappOptIn,
        voiceRepliesEnabled: voiceReplies,
      });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your profile feeds every calculation the engine makes.</p>
      </div>

      <form onSubmit={save} className="surface space-y-5 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={user?.email ?? ''} disabled />
          </div>
          <div>
            <Label htmlFor="occupation">Occupation</Label>
            <Input id="occupation" value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="Software Engineer" />
          </div>
          <div>
            <Label htmlFor="city">City</Label>
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" />
          </div>
          <div>
            <Label htmlFor="income">Declared monthly income (₹)</Label>
            <Input id="income" type="number" min={0} value={income} onChange={(e) => setIncome(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Used until 2+ months of income history are observed.</p>
          </div>
          <div>
            <Label htmlFor="emergencyMonths">Emergency fund target (months)</Label>
            <Input
              id="emergencyMonths"
              type="number"
              min={0}
              max={36}
              value={emergencyMonths}
              onChange={(e) => setEmergencyMonths(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <label className="flex items-center justify-between text-sm">
            <span>
              <span className="font-medium">WhatsApp interaction</span>
              <p className="text-xs text-muted-foreground">Manage your finances by chatting with FlowMoney AI on WhatsApp.</p>
            </span>
            <input
              type="checkbox"
              checked={whatsappOptIn}
              onChange={(e) => setWhatsappOptIn(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>
              <span className="font-medium">Voice replies</span>
              <p className="text-xs text-muted-foreground">Let the assistant reply to voice notes with a spoken response.</p>
            </span>
            <input
              type="checkbox"
              checked={voiceReplies}
              onChange={(e) => setVoiceReplies(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
        )}
        {saved && (
          <div className="rounded-md border border-success/20 bg-success/5 px-3 py-2 text-sm text-success">Settings saved.</div>
        )}

        <Button type="submit" loading={saving}>
          Save changes
        </Button>
      </form>

      {user && (
        <div className="surface p-6">
          <h2 className="mb-3 text-sm font-semibold">Roles &amp; permissions</h2>
          <div className="flex flex-wrap gap-2">
            {user.roles.map((role) => (
              <span key={role} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {role}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <AppShell nav={CUSTOMER_NAV} section="dashboard">
        <SettingsForm />
      </AppShell>
    </AuthGuard>
  );
}
