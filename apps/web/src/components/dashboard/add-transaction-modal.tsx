'use client';

import { useState } from 'react';
import { Modal } from '@/components/admin/modal';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';

interface Category {
  key: string;
  label: string;
}

interface LoggedTransaction {
  id: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  categoryLabel: string;
  balanceAfter: number;
}

/**
 * Same primitive WhatsApp uses when you text "spent 500 on lunch" — this
 * form just calls POST /transactions directly instead of going through the
 * AI orchestrator, since a form doesn't need natural-language parsing.
 */
export function AddTransactionModal({
  open,
  onClose,
  categories,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  onCreated: (result: LoggedTransaction) => void;
}) {
  const [direction, setDirection] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [amount, setAmount] = useState('');
  const [categoryKey, setCategoryKey] = useState('shopping');
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDirection('DEBIT');
    setAmount('');
    setCategoryKey('shopping');
    setDescription('');
    setMerchant('');
    setDate(new Date().toISOString().slice(0, 10));
    setIsRecurring(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0 || !description.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // A bare "YYYY-MM-DD" parses to midnight UTC, which sorts a same-day
      // entry below every other transaction that has a real time-of-day —
      // it looked like logging silently failed when it had actually
      // succeeded, just buried at the bottom of "today". Carry the current
      // wall-clock time onto whatever date was picked instead.
      const now = new Date();
      const [year, month, day] = date.split('-').map(Number);
      const occurredAt = new Date(
        year,
        (month ?? 1) - 1,
        day ?? 1,
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
      );

      const result = await api.post<LoggedTransaction>('/transactions', {
        amount: Number(amount),
        direction,
        categoryKey,
        description: description.trim(),
        merchant: merchant.trim() || undefined,
        occurredAt: occurredAt.toISOString(),
        isRecurring,
      });
      reset();
      onCreated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log this transaction');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add a transaction"
      description="Log something that already happened — it updates your balance and budget immediately, same as texting it on WhatsApp."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDirection('DEBIT')}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              direction === 'DEBIT' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
            }`}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setDirection('CREDIT')}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              direction === 'CREDIT' ? 'border-success bg-success/10 text-success' : 'border-border text-muted-foreground'
            }`}
          >
            Income / refund
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="amount">Amount (₹)</Label>
            <Input
              id="amount"
              type="number"
              min={1}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500"
            />
          </div>
          <div>
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </div>
        </div>

        <div>
          <Label htmlFor="category">Category</Label>
          <Select id="category" value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)}>
            {categories.length === 0 ? (
              <option value="shopping">Shopping</option>
            ) : (
              categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))
            )}
          </Select>
        </div>

        <div>
          <Label htmlFor="description">What was it?</Label>
          <Textarea
            id="description"
            required
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Lunch with the team"
          />
        </div>

        <div>
          <Label htmlFor="merchant">Merchant (optional)</Label>
          <Input id="merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Swiggy" />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          This repeats every month
        </label>

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} disabled={!amount || !description.trim()}>
            Log transaction
          </Button>
        </div>
      </form>
    </Modal>
  );
}
