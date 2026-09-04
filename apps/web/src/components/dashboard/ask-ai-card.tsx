'use client';

import { Sparkles, Send, Bot } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api';
import { RISK_STYLES } from '@/lib/format';
import type { ChatResponse } from '@/lib/types';

const SUGGESTIONS = [
  'Can I afford a ₹20,000 trip this month?',
  'How much did I spend this month?',
  'Why am I always broke?',
  'Where should I put my extra ₹20,000?',
];

export function AskAiCard({ compact = false }: { compact?: boolean }) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ChatResponse | null>(null);

  async function ask(text: string) {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<ChatResponse>('/ai/chat', {
        message: text,
        channel: 'WEB',
        conversationId: response?.conversationId ?? undefined,
      });
      setResponse(result);
      setMessage('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const riskStyle = response?.structured ? RISK_STYLES[response.structured.riskLevel] : null;

  return (
    <div className="surface animate-fade-up overflow-hidden">
      <div className="mesh flex items-center gap-2.5 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">Ask FlowMoney AI</p>
          <p className="text-xs text-muted-foreground">Grounded in your real numbers — never a guess.</p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {!compact && !response && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void ask(s)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {response && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{response.reply}</p>
            </div>

            {response.structured && (
              <div className="ml-8 flex flex-wrap items-center gap-2">
                {riskStyle && <Badge tone={riskStyle.tone}>{riskStyle.label}</Badge>}
                <Badge tone="neutral">Intent: {response.trace.intent.replace(/_/g, ' ').toLowerCase()}</Badge>
                <Badge tone={response.trace.usedLLM ? 'primary' : 'neutral'}>
                  {response.trace.usedLLM ? `${response.trace.model}` : 'Deterministic engine'}
                </Badge>
              </div>
            )}

            {response.quickActions.length > 0 && (
              <div className="ml-8 flex flex-wrap gap-2 pt-1">
                {response.quickActions.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => void ask(qa.command)}
                    className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(message);
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Can I buy a ₹18,000 phone?"
            rows={1}
            className="min-h-10 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask(message);
              }
            }}
          />
          <Button type="submit" size="icon" loading={loading} disabled={!message.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
