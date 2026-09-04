# FlowMoney AI

A WhatsApp-first AI financial copilot: users manage their financial life primarily through WhatsApp (and a web dashboard), asking things like *"Can I buy a ₹18,000 phone?"* and getting a numeric, grounded answer — never a guess.

**The core rule the whole system is built around:** the LLM never invents a financial number. A deterministic engine (`packages/financial-engine`) computes every balance, ratio, score and verdict from real transaction data; the LLM (or an offline template renderer when no API key is configured) only explains what the engine already decided.

```
User: "Can I buy a PS5 for ₹50,000?"
  → Purchase Analyst agent calls evaluate_purchase
  → financial-engine computes: score 7/100, verdict NOT_RECOMMENDED,
    discretionary budget gap ₹38,000, emergency fund would drop to 0 months…
  → the LLM turns that JSON into a natural WhatsApp/chat reply
  → stored as a PurchaseDecision, visible in the dashboard's purchase history
```

## Architecture

```
apps/
  web       Next.js 15 (App Router) dashboard + purchase simulator + AI chat + admin portal
  api       Fastify API — auth, RBAC, banking/payments, AI orchestrator, WhatsApp/voice webhooks
  worker    BullMQ scheduled jobs — health snapshots, idle-cash/anomaly/budget alerts, monthly reports

packages/
  database          Prisma schema, client, seed script (10 realistic demo customers)
  financial-engine  Pure, deterministic math: snapshots, budget, purchase decisions, health score,
                     idle-cash detection, anomaly detection, monthly reports — no I/O, no LLM
  ai-agents         Intent classification, multi-agent orchestrator, tool-calling, offline renderer
  shared-types      Zod schemas, enums, domain types shared by every app (the API contract)
```

The financial engine is the only place a number is computed. The API's route handlers, the AI orchestrator's tools, and the worker's scheduled jobs are all thin wrappers that load data from Postgres, hand it to the engine, and persist or return the result. `apps/web` never computes a financial number client-side — it only renders what the API returns.

### AI agent architecture

Every inbound message (WhatsApp, voice transcript, or the web chat) goes through the same pipeline, defined in `packages/ai-agents`:

```
message → intent classifier → agent router → tool calls (financial-engine) → LLM explains → reply
```

Eight agents ship by default (Financial Advisor, Purchase Analyst, Budget Coach, Risk Analyst, Investment Education, Monthly Report, Savings Optimizer, Fraud/Anomaly Watch), each with its own system instructions, allowed tools and output format — all stored as data in `AIAgent`/`AIAgentConfiguration` rows, editable live from `/admin/agents` with **no code change or deploy**. Roles and permissions are equally dynamic: `/admin/roles` lets a bank admin create a role like "Premium Wealth Advisor" with an arbitrary permission set, enforced on the very next request.

When `OPENAI_API_KEY` is unset, `packages/ai-agents/src/renderer.ts` produces the same structured explanation from a deterministic template instead of calling OpenAI — the whole platform (including WhatsApp) works end to end with zero external API keys.

### Banking, payments, WhatsApp and voice — provider abstractions

Every external integration is an interface with a `mock` implementation used by default, so the whole system runs without any real bank, payment or WhatsApp account:

| Interface | Location | Mock | Real implementations |
|---|---|---|---|
| `BankingProvider` | `apps/api/src/services/banking` | `MockBankingProvider` (seeded accounts/transactions) | — |
| `PaymentProvider` | `apps/api/src/services/payments` | `MockPaymentProvider` | — |
| `WhatsAppProvider` | `apps/api/src/services/whatsapp` | `MockWhatsAppProvider` (+ `/webhooks/whatsapp/outbox` to inspect sent messages) | Meta Cloud API, Twilio |
| `VoiceProvider` | `apps/api/src/services/voice` | `MockVoiceProvider` | (Twilio Voice — interface only) |

Switch providers with `WHATSAPP_PROVIDER` / `BANKING_PROVIDER` / `PAYMENT_PROVIDER` / `VOICE_PROVIDER` in `.env`.

### Payments require explicit confirmation

An AI agent's recommendation never moves money. `POST /payments/intent` creates an intent and returns a confirmation phrase; the user must send that exact phrase back to `POST /payments/:id/confirm` before anything is executed. See `apps/api/src/services/payment.service.ts`.

## Running locally

**Prerequisites:** Node 20+, [pnpm](https://pnpm.io) (`corepack enable && corepack prepare pnpm@11.24.0 --activate` if you don't have it), Docker (for Postgres/Redis — or point `DATABASE_URL`/`REDIS_URL` at your own).

```bash
cp .env.example .env
# generate real secrets for local dev, or leave the placeholders — only OPENAI_API_KEY
# being empty is meaningful (it switches the AI to the offline template renderer)
openssl rand -base64 48   # → JWT_ACCESS_SECRET
openssl rand -base64 48   # → JWT_REFRESH_SECRET
openssl rand -base64 32   # → COOKIE_SECRET
openssl rand -base64 32   # → ENCRYPTION_KEY

docker compose up -d postgres redis     # infra only — apps run on the host via pnpm
pnpm install
pnpm db:generate
pnpm db:migrate                          # applies the Prisma schema
pnpm db:seed                             # 15 users incl. Shaun (the reference scenario), 6 months
                                          # of realistic transactions, and demo AI conversations
pnpm dev                                 # api :4000, worker, web :3000 — all three, concurrently
```

Open **http://localhost:3000** and sign in with the seeded demo account:

```
shaun@flowmoney.dev / Password123!
```

Staff accounts (same password) for the admin portal: `admin@flowmoney.dev` (BANK_ADMIN), `root@flowmoney.dev` (SUPER_ADMIN). The seed output lists all ten customer accounts.

### Trying the WhatsApp flow without a WhatsApp Business account

With `WHATSAPP_PROVIDER=mock` (the default), post directly to the webhook the same way Meta/Twilio would, using any seeded user's phone number:

```bash
curl -X POST http://localhost:4000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"from":"+919876500001","text":"Can I buy a PS5 for 50000?","profileName":"Shaun"}'
```

The reply is generated by the exact same orchestrator the web chat and voice pipeline use. Inspect everything the mock "sent" (what a real WhatsApp user would have received) at `GET /webhooks/whatsapp/outbox` (requires auth).

### Individual services

```bash
pnpm dev:api      # Fastify API on :4000
pnpm dev:web      # Next.js dashboard on :3000
pnpm dev:worker   # BullMQ scheduled jobs (health snapshots, idle-cash/anomaly/budget
                   # alerts, monthly reports) — runs once immediately on boot, then on
                   # SWEEP_INTERVAL_MINUTES / MONTHLY_REPORT_CHECK_MINUTES
```

### Docker

```bash
docker compose --profile full up -d --build   # postgres, redis, minio, api, worker, web
```

The `full` profile builds and runs every app in a container (see `infra/docker/*.Dockerfile`); omitting `--profile full` starts just the infrastructure (Postgres, Redis, MinIO) for running the apps on the host with `pnpm dev`, which is faster for iteration.

## Testing

```bash
pnpm test         # financial-engine (60 tests) + ai-agents (32 tests) + api
pnpm typecheck     # every package and app, strict mode
pnpm build         # full production build of packages → api → worker → web
```

`packages/financial-engine/test` is the important one to read if you want to understand the affordability formula: it asserts the exact spec scenarios (the "buy a ₹18,000 phone" example, the ₹100k-balance "smart buy" case, guardrail behaviour when a purchase would exceed cash-on-hand, etc).

## Key API endpoints

Full surface in `apps/api/src/modules/*/routes.ts`. The ones that matter most:

| Endpoint | What it does |
|---|---|
| `POST /purchase/analyze` | The deterministic affordability engine. No LLM involved. |
| `POST /ai/chat` | Single entry point used by both the web chat and WhatsApp — same orchestrator, same tools. |
| `GET /financial-snapshot` / `GET /financial-health` | The numbers behind the dashboard's hero cards. |
| `GET /reports/monthly/:month` / `POST /reports/monthly/:month/export` | Monthly report (JSON) and PDF export. |
| `GET /investment/recommendations` | Idle-cash detection + an illustrative allocation simulation (never places an order). |
| `POST /admin/agents`, `POST /admin/roles` | Dynamic agent/role creation — no deploy required. |

## What's mocked vs. real

This is a realistic **prototype**: the financial math, RBAC, auth, AI orchestration, WhatsApp message handling and admin tooling are fully real and exercised end to end. What's intentionally mocked (with a clean interface so a real provider is a drop-in swap, not a rewrite): bank account data, payment execution, WhatsApp transport, and voice transport. Investment guidance is explicitly labelled as an educational simulation, never a placed order or licensed advice.

## Environment variables

See `.env.example` for the full list with comments. The one that changes behaviour most: leaving `OPENAI_API_KEY` empty runs the entire AI layer — WhatsApp included — on the deterministic offline renderer instead of calling OpenAI, which is the default so the project works with zero API keys.
