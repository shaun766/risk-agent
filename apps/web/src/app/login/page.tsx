'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/hooks/use-session';

type Mode = 'login' | 'register';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useSession();
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('shaun@flowmoney.dev');
  const [password, setPassword] = useState('Password123!');
  const [fullName, setFullName] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'login') {
        await api.post('/auth/login', { email, password }, { retryOnUnauthorized: false });
      } else {
        await api.post(
          '/auth/register',
          {
            email,
            password,
            fullName,
            monthlyIncome: monthlyIncome ? Number(monthlyIncome) : undefined,
          },
          { retryOnUnauthorized: false },
        );
      }
      await refresh();
      router.push(params.get('next') ?? '/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mesh flex min-h-screen items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="surface w-full max-w-md p-8 shadow-xl"
      >
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">FlowMoney AI</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {mode === 'login'
            ? 'Sign in to your AI-powered financial copilot.'
            : 'Get numeric, grounded answers about every purchase.'}
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          {mode === 'register' && (
            <div>
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Shaun Reegan"
              />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={mode === 'register' ? 10 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
            />
          </div>
          {mode === 'register' && (
            <div>
              <Label htmlFor="income">Monthly income (₹, optional)</Label>
              <Input
                id="income"
                type="number"
                min={0}
                value={monthlyIncome}
                onChange={(e) => setMonthlyIncome(e.target.value)}
                placeholder="75000"
              />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" loading={loading} size="lg">
            {mode === 'login' ? 'Sign in' : 'Create account'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            className="font-medium text-primary hover:underline"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </p>

        {mode === 'login' && (
          <div className="mt-6 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            Demo login: <span className="font-mono">shaun@flowmoney.dev</span> / <span className="font-mono">Password123!</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
