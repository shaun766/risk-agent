'use client';

import { Bot, Plus, Send, Sparkles, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormattedReply } from '@/components/dashboard/formatted-reply';
import { useApi } from '@/hooks/use-api';
import { api, ApiError } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import type { ChatResponse } from '@/lib/types';

interface AgentInfo {
  key: string;
  name: string;
  handledIntents: string[];
}

interface ConversationSummary {
  id: string;
  title: string | null;
  agent: { key: string; name: string } | null;
  messageCount: number;
  lastMessageAt: string;
}

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  agentKey?: string;
}

export default function AgentsChatPage() {
  const agents = useApi<{ agents: AgentInfo[] }>('/ai/agents');
  const conversations = useApi<{ items: ConversationSummary[] }>('/ai/conversations', { query: { pageSize: 20 } });

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [agentKey, setAgentKey] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadedConversation = useApi<{ messages: Message[]; agent: { key: string } | null }>(
    conversationId ? `/ai/conversations/${conversationId}` : null,
    undefined,
    [conversationId],
  );

  useEffect(() => {
    if (loadedConversation.data) {
      setMessages(loadedConversation.data.messages);
    }
  }, [loadedConversation.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: 'USER', content: text, createdAt: new Date().toISOString() },
    ]);
    setLoading(true);
    try {
      const result = await api.post<ChatResponse>('/ai/chat', {
        message: text,
        channel: 'WEB',
        conversationId: conversationId ?? undefined,
        agentKey: agentKey || undefined,
      });
      setConversationId(result.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: result.messageId,
          role: 'ASSISTANT',
          content: result.reply,
          createdAt: new Date().toISOString(),
          agentKey: result.trace.agentKey,
        },
      ]);
      conversations.refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    setConversationId(null);
    setMessages([]);
    setError(null);
  }

  return (
    <div className="mx-auto grid h-[calc(100vh-8rem)] max-w-7xl grid-cols-1 gap-6 md:grid-cols-4">
      <div className="surface hidden flex-col md:flex md:col-span-1">
        <div className="border-b border-border p-3">
          <Button variant="outline" size="sm" className="w-full" onClick={startNew}>
            <Plus className="h-3.5 w-3.5" />
            New conversation
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {(conversations.data?.items ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => setConversationId(c.id)}
              className={`w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent ${
                conversationId === c.id ? 'bg-accent' : ''
              }`}
            >
              <p className="truncate font-medium">{c.title || c.agent?.name || 'Conversation'}</p>
              <p className="text-xs text-muted-foreground">{formatRelative(c.lastMessageAt)} · {c.messageCount} messages</p>
            </button>
          ))}
          {conversations.data?.items.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">No conversations yet — ask something below.</p>
          )}
        </div>
      </div>

      <div className="surface flex flex-col md:col-span-3">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">FlowMoney AI</p>
              <p className="text-xs text-muted-foreground">Multi-agent — routes to the right specialist automatically</p>
            </div>
          </div>
          <Select value={agentKey} onChange={(e) => setAgentKey(e.target.value)} className="w-52">
            <option value="">Auto-route</option>
            {(agents.data?.agents ?? []).map((a) => (
              <option key={a.key} value={a.key}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <Bot className="h-8 w-8 text-primary/40" />
              <p className="text-sm">
                Ask about a purchase, your budget, savings, or investments — every answer is grounded in your real
                numbers.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'USER' ? 'flex-row-reverse' : ''}`}>
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  m.role === 'USER' ? 'bg-secondary text-secondary-foreground' : 'bg-primary/15 text-primary'
                }`}
              >
                {m.role === 'USER' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
              </div>
              <div
                className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'USER' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                <FormattedReply text={m.content} />
                {m.agentKey && m.role === 'ASSISTANT' && (
                  <div className="mt-1.5">
                    <Badge tone="neutral" className="text-[10px]">
                      {m.agentKey.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="mx-5 mb-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2 border-t border-border p-4"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Can I buy a ₹50,000 PS5?"
            rows={1}
            className="min-h-10 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button type="submit" size="icon" loading={loading} disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
