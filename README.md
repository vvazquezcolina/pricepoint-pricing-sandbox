# Pricepoint Pricing Sandbox

A small AI-driven hotel-pricing demo. **Built as a portfolio reference for AI-agent-driven SaaS engineering.**

> **Why this exists.** I built this as a worked example to accompany [`ai-agent-workflows`](https://github.com/vvazquezcolina/ai-agent-workflows). The methodology is documented there; this repo is the methodology *applied* to a small full-stack SaaS in the hospitality-pricing domain.

---

## What it does

Pick a hotel room, pick a night, optionally add an occupancy hint or context note, and ask gpt-5.4-mini for a suggested price. The AI sees:

- Base price (the floor)
- Current price (most recent set rate)
- Date being priced
- Occupancy signal (or seeded estimate)
- Optional context note (events, anomalies)

It returns a suggested price + a one-paragraph rationale. Every suggestion is persisted with the inputs, the model used, the token usage and the cache-hit status — so you can audit the system over time.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 14 (App Router) + React + Tailwind** | Industry-standard production stack |
| Backend | **Next.js API routes (Node runtime)** | Same project, same deploy, no service split |
| ORM | **Prisma** | Type-safe DB access; trivial swap from SQLite to Postgres |
| DB (dev/demo) | **SQLite** (committed seed) | One-command boot; works on Vercel read-only |
| DB (production hint) | **Postgres** via `DATABASE_URL` | One-line provider swap in `schema.prisma` |
| AI | **OpenAI SDK + gpt-5.4-mini** (Sonnet by default) | Prompt caching enabled; usage tracked |
| Validation | **Zod** at API boundaries | Trust internal calls, validate at the edge |
| Tests | **Vitest** | Fast, ESM-native, mock-friendly |
| CI | **GitHub Actions** | Lint + typecheck + test on every push |

---

## Getting started locally

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# edit .env and set OPENAI_API_KEY (get one at platform.openai.com/api-keys)

# 3. Initialize DB + seed
npx prisma migrate dev --name init
npm run seed

# 4. Run
npm run dev
# open http://localhost:3000
```

Run tests:

```bash
npm test
```

---

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvvazquezcolina%2Fpricepoint-pricing-sandbox&env=OPENAI_API_KEY&envDescription=OpenAI+API+key+for+price+suggestions)

The button above forks the repo to your Vercel account and prompts for `OPENAI_API_KEY`. The committed SQLite seed makes the demo immediately runnable; for write-heavy use, swap `provider = "sqlite"` to `"postgresql"` in `prisma/schema.prisma` and point `DATABASE_URL` at a Postgres instance.

---

## Architecture

The full architecture writeup, including the eight Pricepoint-JD-bullet mapping, lives in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

### Quick orientation

```
src/
├── app/
│   ├── page.tsx                    # SSR landing — fetches rooms server-side
│   ├── layout.tsx
│   ├── api/
│   │   ├── rooms/route.ts          # GET /api/rooms
│   │   └── suggest-price/route.ts  # POST /api/suggest-price
│   └── globals.css
├── components/
│   └── PriceDashboard.tsx          # client component, the main UI
└── lib/
    ├── db.ts                       # Prisma singleton
    ├── llm.ts                   # AI inference wrapper (caching, structured output, error mapping)
    └── types.ts                    # zod schemas + TS types

prisma/
├── schema.prisma                   # Room, PriceSuggestion, OccupancyEvent
└── seed.ts                         # 3 rooms + 7 days of occupancy

__tests__/
└── lib/
    ├── llm.test.ts              # AI wrapper: parsing, caching, error paths
    └── types.test.ts               # zod schemas: boundary validation
```

---

## How AI agents built this

Every commit in this repo was authored under the workflow documented in [`ai-agent-workflows`](https://github.com/vvazquezcolina/ai-agent-workflows):

- **Planner** wrote the architecture sketch ([`ARCHITECTURE.md`](./ARCHITECTURE.md)) before any code
- **Generator** implemented file-by-file against the sketch
- **Evaluator** ran tests + the [`simplify`](https://github.com/vvazquezcolina/ai-agent-workflows/blob/main/skills/simplify/SKILL.md) skill on every diff before merge
- Human authored the architecture decisions, reviewed each diff, gated each merge

The throughput multiple this captures: **a working AI-priced SaaS demo (full-stack, tested, CI'd, deployable) in a single sitting** instead of a multi-day build.

---

## License

MIT.

— Built by [Victor Vazquez](https://github.com/vvazquezcolina).
