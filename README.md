<div align="center">

# 🔥 Calorie Tracker

**Snap, speak, or type a meal — get calories and macros with an honest error band, not fake precision.**

A multimodal, provenance-first nutrition tracker. Every calorie traces back to a verifiable food source (USDA, Open Food Facts, FatSecret) rather than an LLM guess.

![Next.js](https://img.shields.io/badge/Next.js_16-000?logo=next.js&logoColor=white)
![React 19](https://img.shields.io/badge/React_19-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle_ORM-C5F74F?logo=drizzle&logoColor=black)
![Tailwind](https://img.shields.io/badge/Tailwind_4-06B6D4?logo=tailwindcss&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_3_Flash-8E75B2?logo=googlegemini&logoColor=white)

</div>

---

## The idea

Most calorie apps fail in two ways that compound: portion-size estimation is the biggest source of error (photo-AI apps can overestimate complex meals by 15–50%), and crowdsourced food databases drift as products change. This app is built around one principle — **the calorie number should be as deterministic as possible, and the UI should be honest about what it can't know.**

- **Provenance over guesswork.** Macros come from real databases (USDA FoodData Central, Open Food Facts, FatSecret, CalorieNinjas). Gemini is used to *identify and portion* food from a photo/voice/text, not to invent nutrition numbers.
- **Error bands, not fake precision.** A meal shows `355 kcal ± 124`, because pretending an estimate is exact is the lie every other app tells.
- **Fast by design.** Log a meal in ~15 seconds (photo + voice), onboard in under a minute.

## Screenshots

> _Add images to `docs/screenshots/` and uncomment the gallery below._

<!--
<div align="center">

| Today | Log a meal | History |
|:---:|:---:|:---:|
| <img src="docs/screenshots/today.png" width="240"/> | <img src="docs/screenshots/log.png" width="240"/> | <img src="docs/screenshots/history.png" width="240"/> |

</div>
-->


## Features

- **Multimodal meal logging** — snap a photo, speak, or type. A streaming AI pipeline identifies items, estimates portions, and resolves each against a nutrition database, then lets you review and edit before saving.
- **Honest macros** — per-meal calories with a low/high error band; daily ring of consumed vs. target plus a protein / carb / fat breakdown.
- **Smart goal engine** — set intent (lose / maintain / gain / track), goal weight, pace, and activity level; calories and macros recompute via Mifflin-St Jeor TDEE, with an optional manual override.
- **Weight tracking** — log weight, see a trend chart with a 7-day moving average, a goal-weight reference line, and a "distance to goal" readout.
- **Water logging** — quick-add or custom amounts toward a daily hydration goal, with progress reflected on the dashboard and calendar.
- **History calendar** — month grid with per-day calorie and water bars; tap any day for a full breakdown.
- **Recipes** — build reusable recipes once and log them as a single item.
- **Barcode scanning** — scan packaged foods straight to Open Food Facts.
- **Streaks & onboarding** — a light, Duolingo-style onboarding and a logging streak to build the habit.
- **Passwordless auth** — email one-time-code sign-in (no passwords to manage).
- **PWA** — installable on iOS, theme-aware (light/dark), built for iPhone and desktop.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, Server Actions, RSC) + Turbopack |
| Language | **TypeScript** (strict) |
| UI | **Tailwind CSS 4**, Radix primitives (shadcn-style), Lucide, Framer Motion, Recharts |
| Database | **Supabase Postgres** with Row-Level Security |
| ORM | **Drizzle** (type-safe queries + migrations) |
| Auth & Storage | **Supabase Auth** (email OTP) + Supabase Storage (meal photos) |
| Validation | **Zod** — one schema reused as Gemini's response schema, form validation, and TS types |
| AI | **Gemini 3 Flash Preview** (multimodal extraction with JSON-schema output) |
| Voice | Browser **Web Speech API**, with **OpenAI Whisper** fallback |
| Nutrition data | USDA FoodData Central · Open Food Facts · FatSecret · CalorieNinjas |
| Testing | **Vitest** (unit + Testcontainers integration), **Playwright** (E2E), a custom LLM eval harness |
| Hosting | **Vercel** |

## How a meal becomes data

```
photo / voice / text
        │
        ▼
  /api/analyze  ──►  Gemini 3 Flash (identify + portion, JSON schema)
        │                       │
        │            streamed back as NDJSON (live UI updates)
        ▼                       ▼
  resolve each item  ──►  USDA / Open Food Facts / FatSecret / CalorieNinjas
        │
        ▼
  review & edit  ──►  save (Server Action → Drizzle → Supabase, RLS-scoped)
```

Each food item carries the source it was matched against, so every number on the screen is traceable.

## Getting started

### Prerequisites
- Node 20+, [pnpm](https://pnpm.io) 9+
- A [Supabase](https://supabase.com) project (Postgres + Auth + Storage)
- API keys: [Gemini](https://ai.google.dev), [USDA FoodData Central](https://fdc.nal.usda.gov/api-key-signup) (free); OpenAI optional (Whisper fallback)

### Setup

```bash
pnpm install
cp .env.example .env.local      # then fill in the values below

# apply the schema + Row-Level Security policies to your Supabase DB
pnpm tsx db/apply.ts

pnpm dev                        # http://localhost:3000
```

### Environment

See `.env.example` for the full list. Core variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                   # direct Postgres URL for Drizzle migrations
GEMINI_API_KEY=
USDA_API_KEY=
OPENAI_API_KEY=                 # optional — Whisper voice fallback
```

Email sign-in uses Supabase Auth; point its SMTP at a provider (e.g. Resend) and add `{{ .Token }}` to the email template to deliver the one-time code.

## Project structure

```
app/
  (public)/        login + onboarding flow
  (app)/           today, log, history, weight, recipes, settings
  api/             analyze (streaming), transcribe, barcode
actions/           Server Actions (meals, goals, weights, water, recipes…)
lib/               gemini, nutrition sources (usda/off/fatsecret/…), goals math, supabase
db/                Drizzle schema, migrations, RLS policies
schemas/           Zod schemas (shared by Gemini, forms, and types)
components/         UI (ring, charts, capture, water card, meal cards…)
tests/             Vitest unit + integration
```

## Testing

```bash
pnpm test              # unit tests (Vitest)
pnpm typecheck         # tsc --noEmit
pnpm test:integration  # Postgres integration (Testcontainers)
pnpm test:e2e          # Playwright
```

## Status

Active personal project. Built multi-user from day one (RLS-scoped) so it scales beyond a single account. Deliberately out of scope for now: social features, two-way Apple Health sync, and native mobile builds.

---

<div align="center">

Built by **Bibas Kandel** · [GitHub](https://github.com/Kandel-Bibas) · [bibas.dev](https://bibas.dev)

</div>
