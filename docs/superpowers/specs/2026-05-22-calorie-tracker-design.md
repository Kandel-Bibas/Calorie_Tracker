# Calorie Tracker — Design Spec

**Status:** Approved (2026-05-22)
**Owner:** Kandel-Bibas
**Target devices:** iPhone 16 Pro Safari, MacBook Pro M5 Safari/Chrome
**Hosting:** Vercel

---

## 1. Problem and goals

### Problem
Existing calorie tracking apps have two failure modes that compound:
1. **Portion-size estimation is the biggest source of error** — even photo-based AI apps overestimate calories by 15–50% on complex meals.
2. **Crowdsourced food databases drift** — entries go stale, packaged-food recipes change, mixed dishes are inaccurately tagged.

### Primary goal
Build a single-developer-grade, multi-user calorie tracker for personal use where **the calorie number is as deterministic as possible**. Every calorie traces to a verifiable source (USDA, Open Food Facts, or a user-defined recipe), never to LLM guesswork.

### Secondary goals
- Smooth, Duolingo-inspired onboarding (≤ 60 seconds end-to-end).
- Friction-light meal logging (target: ≤ 15 seconds per meal via photo + voice).
- Responsive across iPhone 16 Pro and MacBook Pro; PWA-installable on iPhone.
- Honest UI: show error bands instead of fake-precision single numbers.

### Non-goals (deferred to v2+)
- Social/sharing features.
- Apple Health two-way sync.
- CSV export / data portability.
- Native iOS / Android builds.
- Coach / chatbot modes.
- Multi-language UI (voice transcripts can be any language Gemini handles).

---

## 2. Users

Single named user (project author) for v1; multi-user infrastructure from day one so family/friends can be added without rework.

Persona: privacy-conscious, comfortable weighing food, wants nutrition data with provenance.

---

## 3. Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Next.js 16 App Router** | Server Actions + RSC eliminate REST boilerplate for forms; single runtime for whole stack. |
| Language | **TypeScript** (strict mode) | End-to-end type safety from DB through UI. |
| Styling | **Tailwind CSS 4 + shadcn/ui (Radix primitives)** | Mobile-responsive utilities; shadcn ships Lucide icons. |
| ORM | **Drizzle** | Type-safe queries, codegen from migrations, lightweight. |
| Auth + DB + Storage | **Supabase** | Postgres + Auth + Storage + RLS in one. |
| Validation | **Zod** | Schemas reused as Gemini `responseSchema`, form validation, and TS types. |
| AI | **Gemini 3 Flash Preview** (`gemini-3-flash-preview`) | Native multimodal, JSON Schema support, low latency, `thinking_level: "low"` for structured extraction. |
| Voice | **Browser Web Speech API** (primary) + **OpenAI Whisper** (fallback) | Free on iOS Safari 17+, fallback when unsupported. |
| Hosting | **Vercel** | Native Next.js host; one deploy surface. |
| Tests | **Vitest** (unit/integration), **Playwright** (E2E), custom **eval harness** (LLM regression) | Standard JS testing stack. |
| Animations | **Framer Motion** + **Lottie** (Spark mascot) | Industry standard. |

External APIs:
- **USDA FoodData Central** (free, data.gov API key, 1000 req/hr/key)
- **Open Food Facts** (free, no key required, ~3M products)
- **Google AI (Gemini)** API key — pay-per-token
- **OpenAI Whisper** API key — fallback only

---

## 4. Architecture

```
                    iPhone 16 Pro Safari  /  MacBook Pro Safari
                                  │
                                  ▼
                ┌──────────────────────────────────────────┐
                │      Next.js 16 App Router on Vercel      │
                │                                            │
                │  app/                                      │
                │   (public)/login, signup, callback         │
                │   (app)/                                   │
                │     log/, log/review                       │
                │     today/                                 │
                │     history/, history/[date]               │
                │     weight/                                │
                │     recipes/, recipes/new, recipes/[id]    │
                │     settings/, settings/goals              │
                │   api/                                     │
                │     analyze/ (streaming)                   │
                │     transcribe/ (Whisper fallback)         │
                │                                            │
                │  actions/                                  │
                │   saveMeal, editMeal, deleteMeal,          │
                │   logWeight, updateGoal, saveRecipe        │
                │                                            │
                │  lib/                                      │
                │   gemini.ts, usda.ts, openfoodfacts.ts     │
                │   db.ts (Drizzle), schemas/ (Zod)          │
                │   goals.ts (Mifflin-St Jeor), streak.ts    │
                │   normalize.ts, dates.ts (timezones)       │
                │                                            │
                │  components/                               │
                │   spark/ (mascot SVG + motion)             │
                │   ring/  (daily kcal ring)                 │
                │   ...                                      │
                └─────────────┬──────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────────────┐         ┌──────────────────────┐
                │  Supabase                       │         │  Google AI (Gemini)  │
                │  • Postgres (RLS on all tables) │         │  gemini-3-flash      │
                │  • Auth (email/pw + magic link) │         └──────────────────────┘
                │  • Storage (meals bucket)       │
                └─────────────────────────────────┘         ┌──────────────────────┐
                                                            │  USDA FoodData       │
                                                            │  Central + OpenFood  │
                                                            │  Facts               │
                                                            └──────────────────────┘
```

**Process boundaries:**
- All backend logic in Next.js Server Actions + one streaming Route Handler (`/api/analyze`).
- DB access via Drizzle (server-side); Supabase JS client only for auth cookies + Storage uploads.
- No FastAPI, no separate backend service.

---

## 5. Theme and mascot

**Visual direction:** iOS Clean — white surfaces, soft pastel accents, SF Pro Display, generous whitespace, large numeric typography for the daily ring.

**Mascot: Spark** — an animated flame character. Appears on:
- `/onboarding` welcome + plan-reveal screens
- `/today` when daily goal is hit (cheer animation)
- `/log/review` during analysis (subtle thinking animation)
- Streak milestone toasts (3, 7, 14, 30 days)

**Spark motion library:**
- Idle bounce (1.4s loop) + flame flicker (continuous)
- Blink every 3s
- Pupil-dart every 5s
- Periodic hop every ~5s
- Hover/celebration: wobble + confetti burst
- Implemented via inline SVG + Framer Motion; Lottie files for complex sequences

**Accents:** Spark-orange `#FF6B35` reserved for the Capture button and Spark's body. iOS-blue `#007AFF` for non-destructive secondary actions. iOS-red `#FF3B30` for the calorie ring fill.

---

## 6. Onboarding flow

Seven screens, single-decision-per-screen, progress dots top. Target completion: 45–60 seconds. Auth is **deferred until first save**.

1. **Welcome** — Spark hero, one-line value prop, `Get started`.
2. **Goal** — Lose / Maintain / Gain / Just track (Lucide icons).
3. **About you** — Sex, age, height.
4. **Body** — Current weight, target weight, pace (Easy / Steady / Aggressive).
5. **Your plan** — Mifflin-St Jeor-computed daily target (editable inline), macro split, estimated arrival date. Confetti reveal.
6. **Streak commitment** — "Commit to 7 days," visual 7-day grid, reminder time picker. Green CTA.
7. **First meal** — Camera viewfinder + `Snap a meal` CTA. Or `Take me to my dashboard`.

Auth: signup modal appears the moment the user taps Save on their first real meal. localStorage persists the draft for 7 days if they abandon.

---

## 7. Data model

Drizzle schemas; Supabase Postgres. RLS enforced on every user-owned table via `auth.uid() = user_id`.

```sql
-- profiles: one per user, mirrors auth.users.id
profiles (
  id              uuid PK REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    text,
  sex             text CHECK IN ('male','female','prefer_not'),
  birth_year      smallint,
  height_cm       smallint,
  units_weight    text DEFAULT 'lb' CHECK IN ('lb','kg'),
  units_height    text DEFAULT 'ft' CHECK IN ('ft','cm'),
  timezone        text DEFAULT 'America/Los_Angeles',
  created_at      timestamptz DEFAULT now()
);

-- goals: versioned (never edit-in-place)
goals (
  id                  uuid PK DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intent              text CHECK IN ('lose','maintain','gain','track'),
  target_weight_kg    numeric(5,2),
  pace                text CHECK IN ('easy','steady','aggressive'),
  daily_kcal          smallint NOT NULL,
  protein_g           smallint,
  carb_g              smallint,
  fat_g               smallint,
  reminder_time       time,
  activated_at        timestamptz DEFAULT now(),
  superseded_at       timestamptz
);
CREATE INDEX ON goals (user_id, activated_at DESC);

-- meals
meals (
  id                  uuid PK DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consumed_at         timestamptz NOT NULL,
  meal_type           text CHECK IN ('breakfast','lunch','dinner','snack'),
  photo_path          text,
  voice_transcript    text,
  total_kcal          numeric(7,2) NOT NULL,
  total_protein_g     numeric(6,2),
  total_carb_g        numeric(6,2),
  total_fat_g         numeric(6,2),
  error_band_low      numeric(7,2),
  error_band_high     numeric(7,2),
  gemini_raw          jsonb,
  created_at          timestamptz DEFAULT now(),
  edited_at           timestamptz
);
CREATE INDEX ON meals (user_id, consumed_at DESC);

-- meal_items: line items per meal
meal_items (
  id                  uuid PK DEFAULT gen_random_uuid(),
  meal_id             uuid NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL,
  food_name           text NOT NULL,
  display_name        text NOT NULL,
  grams               numeric(7,2) NOT NULL,
  kcal                numeric(7,2) NOT NULL,
  protein_g           numeric(6,2),
  carb_g              numeric(6,2),
  fat_g               numeric(6,2),
  logging_mode        text CHECK IN ('component','composite','restaurant_estimate','saved_recipe'),
  user_provided_grams boolean NOT NULL,
  source              text CHECK IN ('usda_foundation','usda_sr','usda_survey','usda_branded','open_food_facts','user_override','gemini_estimate'),
  source_ref          text,
  match_confidence    numeric(3,2),
  user_edited         boolean DEFAULT false
);
CREATE INDEX ON meal_items (meal_id);

-- weights
weights (
  id          uuid PK DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_on date NOT NULL,
  weight_kg   numeric(5,2) NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, recorded_on)
);

-- streaks
streaks (
  user_id           uuid PK REFERENCES auth.users(id) ON DELETE CASCADE,
  current_length    smallint DEFAULT 0,
  longest_length    smallint DEFAULT 0,
  last_logged_date  date,
  freeze_count      smallint DEFAULT 0
);

-- food_cache: GLOBAL cache of USDA + OFF lookups (shared across users)
food_cache (
  id               uuid PK DEFAULT gen_random_uuid(),
  query_normalized text NOT NULL UNIQUE,
  source           text NOT NULL,
  source_ref       text NOT NULL,
  kcal_per_100g    numeric(6,2) NOT NULL,
  protein_per_100g numeric(5,2),
  carb_per_100g    numeric(5,2),
  fat_per_100g     numeric(5,2),
  last_used_at     timestamptz DEFAULT now(),
  use_count        integer DEFAULT 1
);

-- user_food_overrides: PER-USER overrides (recipes, manual entries, etc.)
user_food_overrides (
  id              uuid PK DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_normalized text NOT NULL,
  display_name    text NOT NULL,
  kcal_per_100g   numeric(6,2) NOT NULL,
  protein_per_100g numeric(5,2),
  carb_per_100g   numeric(5,2),
  fat_per_100g    numeric(5,2),
  source          text CHECK IN ('label','manual','off_id','recipe'),
  source_ref      text,
  recipe_ingredients jsonb,
  created_at      timestamptz DEFAULT now(),
  use_count       integer DEFAULT 1,
  UNIQUE (user_id, query_normalized)
);

-- meal_drafts: short-lived analyze→save state
meal_drafts (
  id          uuid PK DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_data  jsonb NOT NULL,
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz DEFAULT (now() + interval '90 minutes')
);

-- ai_calls: observability for Gemini usage
ai_calls (
  id              uuid PK DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  meal_id         uuid REFERENCES meals(id) ON DELETE SET NULL,
  model           text NOT NULL,
  call_kind       text NOT NULL,
  input_tokens    integer,
  output_tokens   integer,
  latency_ms      integer,
  error           text,
  created_at      timestamptz DEFAULT now()
);
```

**RLS** is enabled on every table except `food_cache` (which is shared/public-read):

```sql
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users access own meals"
  ON meals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- (Repeat for every user-owned table)
```

**Storage policies** mirror table RLS:
```sql
CREATE POLICY "users read own meal photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'meals' AND auth.uid()::text = (storage.foldername(name))[1]);
-- (Similar for INSERT, UPDATE, DELETE)
```

---

## 8. Capture-and-analyze flow

### Client state machine (the `/log` screen)

```
IDLE → CAPTURING → RECORDING → ANALYZING → REVIEW → SAVED
                                   ↓
                                 ERROR ← retry → CAPTURING
```

Each transition is explicit in the URL (`/log`, `/log/analyzing/[draftId]`, `/log/review/[draftId]`, `/log?saved=1`) so back-button works and drafts survive refresh.

### Sequence: `/api/analyze` (server-side)

```
Browser → multipart POST (photo? + audio? + transcript? + typed_text?)
                ↓
        Verify auth JWT (Supabase SSR client)
                ↓
        If photo present: upload to Supabase Storage at meals/{uid}/{tmp_draft_id}.jpg
                ↓
        If audio present and no transcript: call /api/transcribe (Whisper)
                ↓
        Build Gemini prompt:
          • System prompt (locked, see §9.2)
          • User content: image bytes + transcript/text
          • responseSchema: MealAnalysisSchema (Zod → JSON Schema)
          • thinking_level: "low"
          • media_resolution: "medium"
                ↓
        Gemini call → structured JSON
                ↓
        For each item (parallel):
          1. Check user_food_overrides (per-user)
          2. Check food_cache (global)
          3. USDA Foundation/SR/Survey (FNDDS)
          4. USDA Branded
          5. Open Food Facts
          6. If all miss → mark Tier 4 (UI fallback)
                ↓
        Compute kcal/macros per item via scale(per_100g, grams)
        Compute meal totals + error band per logging_mode
                ↓
        Persist meal_drafts row (90-min TTL)
                ↓
        Stream response chunks back: status updates + final draft JSON
                ↓
Browser → routes to /log/review/[draft_id]
```

### Sequence: `saveMeal` Server Action

```
Action receives: draft_id, user-edited items array
                ↓
Re-validate against MealAnalysisSchema (defense in depth)
                ↓
For any user-edited items: recompute kcal via scale() with stored source_ref
                ↓
Insert meals row + meal_items rows (single transaction)
Update streaks row
Move photo from tmp path → permanent meals/{uid}/{meal_id}.jpg
Delete meal_drafts row
                ↓
revalidatePath('/today')
return { meal_id }
```

---

## 9. Determinism pipeline

### 9.1 Zod schema (single source of truth)

```ts
export const FoodItemSchema = z.object({
  usda_query: z.string()
    .describe('USDA-friendly normalized food name. Include preparation when it affects nutrition.'),
  display_name: z.string()
    .describe('Clean human-readable label for UI.'),
  grams: z.number().min(1).max(2000)
    .describe('Edible weight in grams.'),
  user_provided_grams: z.boolean()
    .describe('True if user stated the weight explicitly.'),
  logging_mode: z.enum(['component','composite','restaurant_estimate','saved_recipe']),
  composite_components: z.array(z.string()).optional()
    .describe('Only when logging_mode=composite. Ingredients listed by user; fallback if FNDDS misses.'),
  preparation: z.enum(['raw','cooked','fried','grilled','baked','boiled','steamed','unknown']),
  estimation_basis: z.string().optional()
    .describe('Only when user_provided_grams=false.')
});

export const MealAnalysisSchema = z.object({
  items: z.array(FoodItemSchema).min(1).max(15),
  meal_label: z.string().max(60),
  notes: z.string().max(300).optional(),
});
```

No kcal, no macros, no calorie field anywhere in the LLM output schema. That guarantee is structural.

### 9.2 Gemini system prompt (locked)

```
You are a nutrition-data normalizer. The user is telling you what they ate and (usually) how much. Your only jobs are:

1. PARSE the user's transcript/text into discrete food items.
2. NORMALIZE each food name into a USDA FoodData Central-friendly query string.
3. EXTRACT the grams the user stated. Set user_provided_grams=true.
4. Only ESTIMATE grams if the user did not state them. Set user_provided_grams=false and explain in estimation_basis.
5. DETECT logging_mode:
   - "component": user listed individual ingredients with weights
   - "composite": user described a dish with a total weight (e.g. "tomato pasta with chicken, 200g")
   - "restaurant_estimate": user described a meal without weight (e.g. "a slice of pizza")
   - "saved_recipe": user named a recipe (e.g. "200g of mom's daal")

CRITICAL RULES — NEVER VIOLATE:
- NEVER output calories, protein, carbs, or fat. USDA computes those.
- TRUST the user's numbers. If they say "220g spaghetti", use 220 exactly.
- For composite dishes, populate composite_components with ingredients mentioned, so we can fall back if the dish isn't in FNDDS.
- For preparation: include it in usda_query when it materially affects nutrition ("chicken breast, grilled, skinless").
- For ambiguous foods, use the photo to disambiguate.

OUTPUT: Strictly conform to the provided JSON Schema. No prose outside schema fields.
```

### 9.3 USDA / OFF matching pipeline

For each item, in order:

1. **user_food_overrides** (per-user) — if the user has saved this query (recipes, manual entries), use it.
2. **food_cache** (global) — if any user has resolved this query before, use it.
3. **USDA Foundation + SR Legacy + Survey/FNDDS** — REST search via `https://api.nal.usda.gov/fdc/v1/foods/search`. Rank by token-set similarity + preparation match. If `logging_mode='composite'`, FNDDS is prioritized.
4. **USDA Branded Foods** — same endpoint, `dataType=Branded`. Flag as "branded data" in UI.
5. **Open Food Facts** — `https://world.openfoodfacts.org/cgi/search.pl?search_terms=...&json=1`. Flag as "community data."
6. **Tier 4 fallback** — UI shows yellow badge, user can: pick from near-matches, paste a nutrition label (OCR via Gemini), scan a barcode, or skip.

Compute via:
```ts
function scale(per100g: Nutrients, grams: number): ResolvedItem {
  return {
    kcal:    round1(per100g.kcal    * grams / 100),
    protein: round1(per100g.protein * grams / 100),
    carb:    round1(per100g.carb    * grams / 100),
    fat:     round1(per100g.fat     * grams / 100),
  };
}
```

### 9.4 Error bands

Displayed per-meal in UI as `1450 ± 80 kcal`. Computed by summing per-item bands; per-item band is a function of `logging_mode` and `source`:

| logging_mode | source | band % |
|---|---|---|
| component | usda_foundation/sr | ±5% |
| component | usda_survey | ±8% |
| component | usda_branded | ±12% |
| component | open_food_facts | ±15% |
| composite | usda_survey (FNDDS hit) | ±12% |
| composite | gemini ratios + lookups | ±18% |
| saved_recipe | user_override | ±8% |
| restaurant_estimate | any | ±25% |
| any | gemini_estimate (Tier 4) | ±35% |

---

## 10. Pages and navigation

| Route | Purpose |
|---|---|
| `/` | Marketing splash → `Get started` → `/onboarding` |
| `/onboarding` | 7-step Duolingo-style flow |
| `/login` | Email + magic link |
| `/auth/callback` | Supabase magic-link landing |
| `/today` (default after login) | Daily ring, today's meals, Spark cheer on goal hit |
| `/log` | Capture flow (state machine) |
| `/log/review/[draftId]` | Editable analysis result |
| `/history` | Calendar of past days |
| `/history/[date]` | Single-day detail with meals + photos |
| `/weight` | Weight log + trend chart |
| `/weight/add` | Drawer to add weight |
| `/recipes` | List of saved recipes |
| `/recipes/new` | Recipe builder (ingredients + grams → per-100g) |
| `/recipes/[id]` | View/edit; "Log this" shortcut |
| `/settings` | Profile, units, daily target override, reminders, sign out |
| `/settings/goals` | Versioned goal history |

**Layout:** bottom tab bar on mobile (5 tabs, "Log" raised in center, Spark-colored); collapses to left sidebar at ≥1024px on desktop. Single `app/(app)/layout.tsx` handles both via Tailwind responsive utilities.

---

## 11. Error handling

See companion table in design discussion. Key principles:

1. **Never block logging on a failure that has a fallback.** Camera denied → typed input. Mic denied → typed input. Storage upload fails → save without photo. USDA misses → Open Food Facts → Tier 4 UI fallback.
2. **Stream status during slow Gemini calls.** First chunk at 8s ("Taking longer than usual…"), abort at 30s.
3. **Schema-fail retry once with a stricter prompt suffix.** If still fails, surface "couldn't analyze — type the items instead."
4. **Persist drafts in localStorage and in `meal_drafts` table.** Network drops or auth expiry don't lose work.
5. **AI cost guardrails:** per-user $1/day soft cap, hard block beyond; `ai_calls` aggregation table for observability.
6. **Streak edge cases:** timezone-aware via `profiles.timezone` + `dates.toUserDate()`. Backdating allowed. Future-dating disallowed.

---

## 12. Testing strategy

Four layers:

**Layer 1 — Unit (Vitest, ~5s):**
- `lib/usda.scale()`, `lib/normalize()`, `lib/goals.mifflinStJeor()`, `lib/streak.updateStreak()`, `lib/dates.toUserDate()`
- Zod schemas validated against good + malformed fixtures

**Layer 2 — Integration (Vitest + Testcontainers Postgres, ~30s):**
- Migrations apply cleanly
- **RLS: row from user A is invisible to user B** (most critical test)
- Server Actions end-to-end (saveMeal, editMeal, logWeight)
- food_cache second-lookup behavior
- Storage signed-URL access control

**Layer 3 — E2E (Playwright, ~3 min):**
- Onboarding completion
- Log a mocked meal end-to-end
- Edit a saved meal
- Add weight, view chart
- Streak progression
- Re-run all on iPhone 16 Pro viewport

(Gemini + USDA mocked in E2E.)

**Layer 4 — LLM eval (`pnpm eval`, ~3 min, ~$0.05/run):**
- 50-case golden dataset in `evals/golden-meals.jsonl`
- Each case: input photo + transcript → expected items + kcal band
- Assert: schema matches, logging_mode correct, final kcal in band, usda_query similarity > 0.7
- Pass criteria: ≥90% pass + no >5pt regression from baseline
- Runs nightly on main + on PRs touching `lib/gemini.ts`, `lib/usda.ts`, `schemas/`

**Coverage targets:** 80% lines overall; 90% on `lib/usda.ts`, `lib/gemini.ts`, `lib/normalize.ts`, `lib/goals.ts`, Zod schemas.

---

## 13. Accepted-by criteria

- [ ] User can complete onboarding from cold start in ≤ 60 seconds.
- [ ] User can log a photographed meal with voice in ≤ 15 seconds (capture → save).
- [ ] Every saved meal_item row has a `source` and `source_ref` populated.
- [ ] `food_cache` hit rate ≥ 50% after 2 weeks of normal use (single user).
- [ ] RLS integration test passes: user A cannot see user B's rows under any query path.
- [ ] LLM eval suite ≥ 90% pass rate on 50 golden cases.
- [ ] Streak ring renders correctly after midnight in user timezone.
- [ ] Mobile viewport tests pass at iPhone 16 Pro resolution.
- [ ] Lighthouse mobile score ≥ 90 on `/today` (performance + accessibility).
- [ ] Auth session expiry mid-analyze doesn't lose draft state.

---

## 14. Risks and open questions

| Risk | Mitigation |
|---|---|
| Gemini 3 Flash Preview is "preview" — API can change | Wrap Gemini client behind `lib/gemini.ts` adapter; eval suite catches behavior regressions. Pin model version, upgrade explicitly. |
| USDA rate limit (1000/hr/key) | Aggressive `food_cache`; multiple API keys rotatable via env var if ever hit. |
| Web Speech API uneven on Safari mobile | Whisper API fallback; toggle via feature flag. |
| Vercel 500MB function bundle | Not at risk for Node (we're not bundling Python); Next.js + deps comfortably under. |
| User cost runaway | Per-user daily $1 hard cap on Gemini spend in `/api/analyze`. |
| FNDDS coverage gaps for ethnic dishes | User recipe builder handles via `user_food_overrides`. |

Open questions for v2 (not blocking v1):
- Adaptive weekly goal recomputation (MacroFactor-style).
- Apple Health two-way sync.
- Streak freezes purchasable / earnable?

---

## 15. File layout (target)

```
calorie-tracker/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                   # marketing splash
│   │   ├── login/page.tsx
│   │   ├── onboarding/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx               # step 1
│   │   │   ├── goal/page.tsx
│   │   │   ├── about/page.tsx
│   │   │   ├── body/page.tsx
│   │   │   ├── plan/page.tsx
│   │   │   ├── streak/page.tsx
│   │   │   └── first-meal/page.tsx
│   │   └── auth/callback/route.ts
│   ├── (app)/
│   │   ├── layout.tsx                 # bottom tab / sidebar
│   │   ├── today/page.tsx
│   │   ├── log/
│   │   │   ├── page.tsx
│   │   │   └── review/[draftId]/page.tsx
│   │   ├── history/
│   │   │   ├── page.tsx
│   │   │   └── [date]/page.tsx
│   │   ├── weight/page.tsx
│   │   ├── recipes/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       └── goals/page.tsx
│   └── api/
│       ├── analyze/route.ts           # streaming
│       └── transcribe/route.ts        # Whisper fallback
├── actions/
│   ├── meals.ts                       # saveMeal, editMeal, deleteMeal
│   ├── weights.ts                     # logWeight
│   ├── goals.ts                       # updateGoal
│   └── recipes.ts                     # saveRecipe
├── components/
│   ├── spark/                         # mascot SVG + motion variants
│   ├── ring/                          # daily kcal ring
│   ├── meal-card/
│   ├── meal-review/                   # editable items table
│   ├── progress-dots/
│   ├── tab-bar/
│   └── ui/                            # shadcn primitives
├── lib/
│   ├── gemini.ts
│   ├── usda.ts
│   ├── openfoodfacts.ts
│   ├── normalize.ts
│   ├── goals.ts                       # Mifflin-St Jeor + macro split
│   ├── streak.ts
│   ├── dates.ts                       # timezone-aware day grouping
│   ├── error-bands.ts
│   ├── db.ts                          # Drizzle client
│   └── supabase/
│       ├── server.ts                  # SSR client
│       └── client.ts                  # browser client
├── schemas/                           # Zod
│   ├── meal-analysis.ts
│   ├── profile.ts
│   ├── goal.ts
│   └── recipe.ts
├── db/
│   ├── schema.ts                      # Drizzle table definitions
│   ├── migrations/
│   └── seed.ts
├── evals/
│   ├── golden-meals.jsonl
│   ├── fixtures/                      # reference photos
│   └── runner.ts
├── tests/
│   ├── unit/                          # Vitest
│   ├── integration/                   # Vitest + Testcontainers
│   └── e2e/                           # Playwright
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── .env.example
└── README.md
```

---

## 16. Environment variables

```
# Public (exposed to browser)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Server-only
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=            # Whisper fallback only
USDA_API_KEY=
DATABASE_URL=              # Drizzle direct connection
```

---

## 17. Implementation phases

1. **Foundation** — Next.js init, Tailwind, shadcn, Supabase project, env, Drizzle config, base `app/` layout.
2. **Data layer** — Drizzle schemas, migrations, RLS policies, Supabase client wrappers.
3. **Auth + Profile** — login, magic-link, session middleware, profile setup.
4. **Determinism pipeline** — Zod schemas, Gemini client, USDA client, Open Food Facts client, food_cache, error bands.
5. **/api/analyze + /api/transcribe** — streaming Route Handler, Whisper fallback.
6. **Server Actions** — saveMeal, editMeal, deleteMeal, logWeight, updateGoal, saveRecipe.
7. **Core UI** — Spark mascot component, ring, tab bar, /today.
8. **Capture flow UI** — /log state machine, camera + voice, /log/review editable items.
9. **Onboarding** — 7 screens with Mifflin-St Jeor calculator + confetti reveal.
10. **Secondary screens** — /history, /weight + chart, /recipes, /settings.
11. **Error UX** — Tier 4 fallback screens, offline queue (IndexedDB), draft persistence.
12. **Testing** — unit, integration (with RLS test), Playwright E2E, LLM eval suite.
13. **Polish** — Lottie animations, confetti, microcopy, Lighthouse pass.

(Detailed task decomposition lives in the implementation plan, generated separately by `writing-plans` skill.)
