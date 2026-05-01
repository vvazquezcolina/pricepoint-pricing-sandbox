# Architecture

This document covers the engineering decisions made in this repo and maps them, deliberately, to the Pricepoint Senior AI Engineer JD.

---

## The eight JD bullets, mapped to evidence in this codebase

> Pricepoint's JD lists eight responsibilities. This repo (combined with [`ai-agent-workflows`](https://github.com/vvazquezcolina/ai-agent-workflows)) demonstrates each one, in working code.

### 1. Build, maintain, and improve the SaaS platform with AI agents as the primary execution layer

- The whole codebase was built under the agent workflow documented in [`ai-agent-workflows`](https://github.com/vvazquezcolina/ai-agent-workflows).
- The product itself **is** an AI-execution-layer SaaS: an LLM call is the primary action a user takes.
- See [`src/lib/llm.ts`](./src/lib/llm.ts) for the inference wrapper, [`README.md#how-ai-agents-built-this`](./README.md) for the build process.

### 2. Own production features, technical improvements, integrations, bug fixes, refactoring, system reliability

- The repo is small but covers the full feature lifecycle: schema design, API surface, frontend, tests, CI, deploy.
- Error paths are explicit (404 for missing room, 502 for AI failure, 400 for malformed input).
- Prisma singleton pattern in [`src/lib/db.ts`](./src/lib/db.ts) is reliability work, not just convenience.

### 3. Design workflows where AI agents execute development tasks end-to-end, escalating to humans only when judgment, risk, or accountability requires it

- Documented in [`ai-agent-workflows/workflows/agent-vs-human.md`](https://github.com/vvazquezcolina/ai-agent-workflows/blob/main/workflows/agent-vs-human.md).
- This repo is the receipt: the architecture decisions (DB choice, API shape, validation layer, error mapping) were human; the implementation was agent.

### 4. Work across backend, frontend, database, APIs, integrations, deployment, monitoring

| Layer | Where in this repo |
|---|---|
| Backend | [`src/app/api/rooms/`](./src/app/api/rooms/), [`src/app/api/suggest-price/`](./src/app/api/suggest-price/) |
| Frontend | [`src/app/page.tsx`](./src/app/page.tsx), [`src/components/PriceDashboard.tsx`](./src/components/PriceDashboard.tsx) |
| Database | [`prisma/schema.prisma`](./prisma/schema.prisma), [`prisma/seed.ts`](./prisma/seed.ts) |
| API | OpenAPI-style boundary at [`src/lib/types.ts`](./src/lib/types.ts) (zod schemas) |
| Integration | OpenAI SDK in [`src/lib/llm.ts`](./src/lib/llm.ts) with prompt caching |
| Deployment | [Vercel one-click](./README.md#deploy-to-vercel), CI in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) |
| Monitoring | Token usage + cache-hit-ratio persisted on every suggestion (see [`PriceSuggestion`](./prisma/schema.prisma) model) |

### 5. Make technical decisions around architecture, scalability, maintainability, security, performance

Decisions documented below, with rationale:

- **SQLite for the demo, Postgres for production** — explained below
- **Prisma over raw SQL** — type safety scales with schema growth
- **Validation only at the boundary** — `zod` at API entry, trust internal calls
- **Prompt caching on the system prompt** — ~10× cost reduction on repeated calls
- **Server components for SSR rendering** — no extra round-trip for room list
- **Force-dynamic on API routes** — prices change; we don't want stale caches

### 6. Set standards for code quality, testing, observability, release safety

- **Code quality:** every function has a single purpose; comments explain *why*, not *what* (see e.g. [`src/lib/llm.ts`](./src/lib/llm.ts) header)
- **Testing:** [`__tests__/`](./__tests__/) covers boundary validation + AI wrapper edge cases, including the "OpenAI returns malformed JSON" failure mode
- **Observability:** every AI call records `tokensIn`, `tokensOut`, `cacheHit`, `modelUsed` to the `PriceSuggestion` table — auditable post-hoc
- **Release safety:** CI gates every PR (lint + typecheck + test); the standards reference in [`ai-agent-workflows/standards/`](https://github.com/vvazquezcolina/ai-agent-workflows/tree/main/standards)

### 7. Contribute to product decisions and help shape the future engineering team

The product calls in this repo (visible to anyone reading the code):

- **Default to drafts, not auto-apply.** The AI suggests; the human applies. This mirrors the Mandala WhatsApp bot's dual-mode design — a deliberate safety call, not a technical one.
- **Persist every suggestion**, accepted or not. Future-pricing-team needs the history to evaluate the AI's calibration over time.
- **Show the reasoning, not just the price.** Trust comes from explainability. A black-box price suggestion is harder to act on than one with a stated rationale.
- **Track model + cache + tokens per call.** Cost is a product concern, not just an engineering one — these surfaces are what a future eng-team will need to optimize.

### 8. Increase engineering output without lowering quality, reliability, or accountability

- This repo went from empty folder to working full-stack + tests + CI + docs in a single sitting under the agent workflow.
- Quality maintained: typecheck passes, lint passes, tests cover the edge cases that matter (parse failures, missing fields, validation rejection).
- Accountability: every commit is atomic; the architecture decisions are documented; the human-vs-agent split is explicit.

---

## The architecture decisions, with rationale

### SQLite for demo, Postgres for production

**The choice.** SQLite via Prisma in this repo. Single file, committed seed data, zero-server.

**Why for the demo.** A demo with no DB-server-startup friction earns its right to be clicked. Anyone reading this README can clone, install, run — without provisioning a database first.

**Why not for production.** Vercel serverless filesystem is read-only. Writes to SQLite from a serverless function won't persist. For real production at Pricepoint scale, this becomes Postgres in seconds (provider change in `schema.prisma`, `DATABASE_URL` repointed). The data model is identical.

**The trade-off.** The demo's price suggestions persist only across the SSR cycle; restart the dev server, history resets. For evaluating the AI's behavior over time, you'd run with Postgres. The demo is for shape, not longevity.

### Validation at the boundary, not inside

**The choice.** Zod schemas in [`src/lib/types.ts`](./src/lib/types.ts), invoked only at the API route entry. Internal callers trust the types.

**Why.** Two layers of validation duplicate work and obscure where the real boundary is. The boundary is where untrusted input enters: HTTP body, third-party API responses, file I/O. Internal calls have already passed through; trust them or your type system isn't earning its keep.

**The pattern.** This is from [`ai-agent-workflows/standards/code-quality.md`](https://github.com/vvazquezcolina/ai-agent-workflows/blob/main/standards/code-quality.md): *"Validate at boundaries. Trust within."*

### Prompt caching on the system prompt

**The choice.** [`src/lib/llm.ts`](./src/lib/llm.ts) wraps the system prompt in `cache_control: { type: 'ephemeral' }`.

**Why.** The system prompt is identical across every call. Without caching, every request pays for ~600 tokens of system prompt. With caching, the first call writes to the cache (5-min TTL); subsequent calls within the window read at ~10% the cost.

**Concrete impact.** At 10 suggestions/min, that's the difference between $X and $X/10. Over a month at production load, it's the difference between a viable product and a margin problem.

**Why this is in `llm.ts` and not in a wrapper.** Caching is a property of the call shape; it belongs with the call. Future engineers should see it without indirection.

### Server components for the landing, client components for the form

**The choice.** [`src/app/page.tsx`](./src/app/page.tsx) is a server component that fetches rooms via Prisma directly (no API round-trip). [`src/components/PriceDashboard.tsx`](./src/components/PriceDashboard.tsx) is `'use client'` because it has interactive state (selected room, form fields, async submission).

**Why.** Server components are the default for static-ish data (room list); client components are for interactivity. Mixing them is the App Router's actual model — most "should I make this server or client" debates resolve to "both, in the right places."

### Force-dynamic on API routes

**The choice.** Both API routes export `export const dynamic = 'force-dynamic'`.

**Why.** Without it, Next.js will sometimes cache the response at the route level. For a pricing API, stale prices are a real bug. The performance cost is small (these routes are fast), and the correctness gain is non-negotiable.

### Error mapping at the boundary

**The choice.** [`src/app/api/suggest-price/route.ts`](./src/app/api/suggest-price/route.ts) maps errors to specific HTTP codes:
- 400 for malformed JSON / failed schema validation
- 404 for missing room
- 502 for AI inference failure (it's an upstream dependency failure)
- 200 with body for success

**Why not all 500.** "500 Internal Server Error" tells the client nothing actionable. 400 vs 404 vs 502 lets the client surface the right user-visible message and decide whether to retry.

**This is the [observability standard](https://github.com/vvazquezcolina/ai-agent-workflows/blob/main/standards/observability.md) at work:** signal what happened so the next debugger doesn't have to guess.

---

## What this repo deliberately doesn't have (and why)

Realistic SaaS would have these. They were skipped on purpose, with notes for what would be added in production:

- **Auth.** Single-tenant demo. Real Pricepoint has tenants, users, RBAC.
- **Rate limiting.** No abuse control. Real production needs per-tenant limits, especially on AI calls.
- **Background jobs.** All work is synchronous. Real production batches AI calls overnight for next-day pricing.
- **Audit log.** We persist suggestions but don't track who accepted what. Real production needs that.
- **Monitoring beyond DB-side metrics.** No Sentry, no Datadog. Real production needs them.
- **A/B testing of pricing strategies.** Real Pricepoint would compare model prompts, model versions, pricing-rule variants.

These are deliberate omissions, not gaps. Each one would be its own well-scoped feature with its own PRD. The shape of how I'd add each is in [`ai-agent-workflows`](https://github.com/vvazquezcolina/ai-agent-workflows).
