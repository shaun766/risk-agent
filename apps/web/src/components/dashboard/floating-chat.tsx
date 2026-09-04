'use client';

import { Bot, MessageCircle, Send, Sparkles, User, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormattedReply } from '@/components/dashboard/formatted-reply';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { RISK_STYLES } from '@/lib/format';
import type { ChatResponse } from '@/lib/types';

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  riskLevel?: string;
}

const SUGGESTIONS = [
  'Can I afford a ₹18,000 phone?',
  'How am I doing this week?',
  'Where should I put my extra cash?',
];

/**
 * A persistent chat bubble, present on every dashboard page (mounted once in
 * AppShell) so a conversation survives navigating between pages — the same
 * orchestrator and tools WhatsApp uses, so an answer here matches what the
 * same question gets on WhatsApp.
 */
export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) {
      setHasUnread(false);
      inputRef.current?.focus();
    }
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'USER', content: trimmed }]);
    setLoading(true);
    try {
      const result = await api.post<ChatResponse>('/ai/chat', {
        message: trimmed,
        channel: 'WEB',
        conversationId: conversationId ?? undefined,
      });
      setConversationId(result.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: result.messageId,
          role: 'ASSISTANT',
          content: result.reply,
          riskLevel: result.structured?.riskLevel,
        },
      ]);
      if (!open) setHasUnread(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Panel */}
      <div
        className={cn(
          'fixed bottom-24 right-4 z-50 flex h-[min(560px,calc(100vh-7rem))] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all duration-200 md:right-6',
          open ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
        )}
      >
        <div className="mesh flex items-center justify-between border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">FlowMoney AI</p>
              <p className="text-xs text-muted-foreground">Same assistant as WhatsApp</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Ask anything about your money — it&apos;s grounded in your real numbers, same as WhatsApp.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            const riskStyle = m.riskLevel ? RISK_STYLES[m.riskLevel] : null;
            return (
              <div key={m.id} className={cn('flex gap-2.5', m.role === 'USER' && 'flex-row-reverse')}>
                <div
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    m.role === 'USER' ? 'bg-secondary text-secondary-foreground' : 'bg-primary/15 text-primary',
                  )}
                >
                  {m.role === 'USER' ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                </div>
                <div
                  className={cn(
                    'max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                    m.role === 'USER' ? 'bg-primary text-primary-foreground' : 'bg-muted',
                  )}
                >
                  <FormattedReply text={m.content} />
                  {riskStyle && (
                    <div className="mt-1.5">
                      <Badge tone={riskStyle.tone} className="text-[10px]">
                        {riskStyle.label}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Bot className="h-3 w-3" />
              </div>
              <div className="flex items-center gap-1 rounded-2xl bg-muted px-3.5 py-2.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="mx-4 mb-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-2 border-t border-border p-3"
        >
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask FlowMoney AI…"
            rows={1}
            className="min-h-9 resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <Button type="submit" size="icon" className="h-9 w-9 shrink-0" loading={loading} disabled={!input.trim()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>

      {/* Launcher bubble */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : 'Open FlowMoney AI chat'}
        className={cn(
          'fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105 md:right-6',
        )}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        {hasUnread && !open && (
          <span className="absolute right-0 top-0 h-3 w-3 rounded-full bg-destructive ring-2 ring-background" />
        )}
      </button>
    </>
  );
}
