'use client';

import { useState } from 'react';
import { Banknote, Plus } from 'lucide-react';
import { AllocationBucket, FinancialProductType, LiquidityLevel, Permission } from '@flowmoney/shared-types';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Modal } from '@/components/admin/modal';
import { useApi } from '@/hooks/use-api';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/hooks/use-session';
import { formatCurrency, formatPercent, RISK_STYLES } from '@/lib/format';

interface ProductRow {
  id: string;
  name: string;
  bank: string | null;
  type: string;
  riskLevel: string;
  liquidity: string;
  minimumInvestment: number;
  interestRate: number;
  expectedReturnLow: number;
  expectedReturnHigh: number;
  lockInMonths: number;
  bucket: string | null;
  description: string;
  isActive: boolean;
  rates: Array<{ tenureMonths: number; rate: number }>;
}

interface ProductFormState {
  name: string;
  type: string;
  riskLevel: string;
  liquidity: string;
  minimumInvestment: number;
  interestRate: number;
  expectedReturnLow: number;
  expectedReturnHigh: number;
  lockInMonths: number;
  description: string;
  bucket: string;
  isActive: boolean;
}

const PRODUCT_TYPES = Object.values(FinancialProductType);
const LIQUIDITY_LEVELS = Object.values(LiquidityLevel);
const ALLOCATION_BUCKETS = Object.values(AllocationBucket);
const RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

const EMPTY_FORM: ProductFormState = {
  name: '',
  type: FinancialProductType.SAVINGS_ACCOUNT,
  riskLevel: 'LOW',
  liquidity: LiquidityLevel.HIGH,
  minimumInvestment: 0,
  interestRate: 0,
  expectedReturnLow: 0,
  expectedReturnHigh: 0,
  lockInMonths: 0,
  description: '',
  bucket: '',
  isActive: true,
};

export default function AdminProductsPage() {
  const { hasPermission } = useSession();
  const canManage = hasPermission(Permission.MANAGE_FINANCIAL_PRODUCTS);

  const products = useApi<{ products: ProductRow[] }>('/admin/products');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  function openCreate() {
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(product: ProductRow) {
    setEditingProduct(product);
    setForm({
      name: product.name,
      type: product.type,
      riskLevel: product.riskLevel,
      liquidity: product.liquidity,
      minimumInvestment: product.minimumInvestment,
      interestRate: product.interestRate,
      expectedReturnLow: product.expectedReturnLow,
      expectedReturnHigh: product.expectedReturnHigh,
      lockInMonths: product.lockInMonths,
      description: product.description,
      bucket: product.bucket ?? '',
      isActive: product.isActive,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const body = {
      name: form.name,
      type: form.type,
      riskLevel: form.riskLevel,
      liquidity: form.liquidity,
      minimumInvestment: form.minimumInvestment,
      interestRate: form.interestRate,
      expectedReturnLow: form.expectedReturnLow,
      expectedReturnHigh: form.expectedReturnHigh,
      lockInMonths: form.lockInMonths,
      description: form.description,
      bucket: form.bucket || null,
      isActive: form.isActive,
    };
    try {
      if (editingProduct) {
        await api.patch(`/admin/products/${editingProduct.id}`, body);
      } else {
        await api.post('/admin/products', body);
      }
      setModalOpen(false);
      products.refetch();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save product');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: ProductRow) {
    setTogglingId(product.id);
    setListError(null);
    try {
      await api.patch(`/admin/products/${product.id}`, { isActive: !product.isActive });
      products.refetch();
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Could not update product');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Financial Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">The catalogue surfaced to the allocation engine and AI agents.</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New product
          </Button>
        )}
      </div>

      {listError && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {listError}
        </div>
      )}

      {products.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : products.error ? (
        <ErrorState message={products.error} retry={products.refetch} />
      ) : (products.data?.products.length ?? 0) === 0 ? (
        <EmptyState icon={Banknote} title="No products yet" description="Add a financial product to the catalogue." />
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Risk</th>
                <th className="px-4 py-3 font-medium">Liquidity</th>
                <th className="px-4 py-3 font-medium text-right">Min. investment</th>
                <th className="px-4 py-3 font-medium text-right">Return</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {canManage && <th className="px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {products.data?.products.map((p) => {
                const riskStyle = RISK_STYLES[p.riskLevel];
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.name}</p>
                      {p.bank && <p className="text-xs text-muted-foreground">{p.bank}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      {riskStyle && <Badge tone={riskStyle.tone}>{p.riskLevel}</Badge>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.liquidity}</td>
                    <td className="px-4 py-3 text-right tabular">{formatCurrency(p.minimumInvestment)}</td>
                    <td className="px-4 py-3 text-right tabular text-xs">
                      {p.expectedReturnLow || p.expectedReturnHigh
                        ? `${formatPercent(p.expectedReturnLow)} – ${formatPercent(p.expectedReturnHigh)}`
                        : formatPercent(p.interestRate)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={togglingId === p.id}
                            onClick={() => void toggleActive(p)}
                          >
                            {p.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editingProduct ? `Edit ${editingProduct.name}` : 'New product'}
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="product-name">Name</Label>
            <Input
              id="product-name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="HDFC Liquid Fund — Direct Growth"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="product-type">Type</Label>
              <Select id="product-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="product-risk">Risk level</Label>
              <Select
                id="product-risk"
                value={form.riskLevel}
                onChange={(e) => setForm((f) => ({ ...f, riskLevel: e.target.value }))}
              >
                {RISK_LEVELS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="product-liquidity">Liquidity</Label>
              <Select
                id="product-liquidity"
                value={form.liquidity}
                onChange={(e) => setForm((f) => ({ ...f, liquidity: e.target.value }))}
              >
                {LIQUIDITY_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="product-min-investment">Min. investment (₹)</Label>
              <Input
                id="product-min-investment"
                type="number"
                min={0}
                value={form.minimumInvestment}
                onChange={(e) => setForm((f) => ({ ...f, minimumInvestment: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label htmlFor="product-interest-rate">Interest rate (%)</Label>
              <Input
                id="product-interest-rate"
                type="number"
                step={0.01}
                value={form.interestRate}
                onChange={(e) => setForm((f) => ({ ...f, interestRate: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label htmlFor="product-return-low">Expected return low (%)</Label>
              <Input
                id="product-return-low"
                type="number"
                step={0.01}
                value={form.expectedReturnLow}
                onChange={(e) => setForm((f) => ({ ...f, expectedReturnLow: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label htmlFor="product-return-high">Expected return high (%)</Label>
              <Input
                id="product-return-high"
                type="number"
                step={0.01}
                value={form.expectedReturnHigh}
                onChange={(e) => setForm((f) => ({ ...f, expectedReturnHigh: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="product-lockin">Lock-in (months)</Label>
              <Input
                id="product-lockin"
                type="number"
                min={0}
                value={form.lockInMonths}
                onChange={(e) => setForm((f) => ({ ...f, lockInMonths: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label htmlFor="product-bucket">Allocation bucket</Label>
              <Select id="product-bucket" value={form.bucket} onChange={(e) => setForm((f) => ({ ...f, bucket: e.target.value }))}>
                <option value="">None</option>
                {ALLOCATION_BUCKETS.map((b) => (
                  <option key={b} value={b}>
                    {b.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="product-description">Description</Label>
            <Textarea
              id="product-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="A short description shown to customers and AI agents when this product is recommended."
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 accent-primary"
            />
            Active
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
              {editingProduct ? 'Save changes' : 'Create product'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
