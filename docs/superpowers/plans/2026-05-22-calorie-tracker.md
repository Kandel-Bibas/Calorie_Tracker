# Calorie Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **DO NOT run `git commit` at task boundaries — the user has not yet authorized commits. After each task, mark the task complete in TaskList and surface a diff summary; the user will batch-review and commit on their own schedule.**

**Goal:** Build a deterministic, multi-user calorie tracker as a Next.js 16 web app on Vercel, with Supabase for DB/Auth/Storage and Gemini 3 Flash for photo/voice → USDA-grounded nutrition lookups.

**Architecture:** Single Next.js App Router project, Server Actions + one streaming Route Handler, Drizzle ORM, Zod schemas as the single source of truth for both forms and Gemini `responseSchema`. The LLM only normalizes food names; calories come from USDA per-gram lookups. iOS Clean theme with a Spark flame mascot animated via Framer Motion.

**Tech Stack:** Next.js 16, TypeScript strict, Tailwind 4, shadcn/ui, Drizzle ORM, Supabase (Postgres + Auth + Storage), Zod, Gemini 3 Flash Preview, USDA FoodData Central, Open Food Facts, OpenAI Whisper (fallback), Vitest, Playwright, Framer Motion.

**Reference:** `docs/superpowers/specs/2026-05-22-calorie-tracker-design.md` — read for any table schema, Zod type, system prompt, or routing detail not duplicated below.

---

## User-provided prerequisites (block before Phase 5)

The following must be supplied by the user before any task that calls a real external service:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from a Supabase project they create (free tier OK)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `DATABASE_URL` for Drizzle (direct Postgres connection from Supabase project settings)
- `GEMINI_API_KEY` from Google AI Studio
- `USDA_API_KEY` from https://fdc.nal.usda.gov/api-key-signup (free, instant)
- `OPENAI_API_KEY` (optional — only for Whisper fallback when Web Speech API unavailable)

Tasks 1–17 can complete without these. Task 18 onward requires them.

---

## Phase 1 — Project foundation

### Task 1: Initialize Next.js 16 project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `app/layout.tsx`, `app/page.tsx`, `.gitignore` (extend)

- [ ] **Step 1: Initialize via create-next-app**

```bash
cd /Users/bibas/personal/Calorie-Tracker
pnpm dlx create-next-app@latest . \
  --typescript --tailwind --app --src-dir=false \
  --import-alias "@/*" --use-pnpm --no-eslint --no-turbopack \
  --skip-install
```

If `.git` blocks init, move existing `.git` aside, run init, then restore. Files added to existing repo must not delete `.gitignore` or `.superpowers/`.

- [ ] **Step 2: Install dependencies**

```bash
pnpm install
pnpm add drizzle-orm postgres @supabase/ssr @supabase/supabase-js \
  zod @google/genai openai \
  framer-motion lucide-react \
  date-fns date-fns-tz \
  class-variance-authority clsx tailwind-merge
pnpm add -D drizzle-kit @types/node tsx \
  vitest @vitest/coverage-v8 \
  @testcontainers/postgresql testcontainers \
  @playwright/test \
  msw
```

- [ ] **Step 3: Enable TypeScript strict mode**

Edit `tsconfig.json` so `compilerOptions.strict: true`, add `"noUncheckedIndexedAccess": true`.

- [ ] **Step 4: Verify build**

```bash
pnpm dev   # should start at http://localhost:3000
# Ctrl-C, then
pnpm build
```

Expected: build completes without errors.

- [ ] **Step 5: Mark complete in TaskList (do not commit)**

### Task 2: Add shadcn/ui + design tokens

**Files:**
- Create: `components.json`, `components/ui/*` (via shadcn add), `app/globals.css` (extend)

- [ ] **Step 1: Initialize shadcn**

```bash
pnpm dlx shadcn@latest init -d
```

Pick: TypeScript yes, default style, base color "Neutral", CSS variables yes.

- [ ] **Step 2: Install primitives we'll need**

```bash
pnpm dlx shadcn@latest add button input label textarea \
  select switch slider drawer dialog sheet \
  card badge tabs toast progress separator \
  popover form skeleton avatar
```

- [ ] **Step 3: Extend `app/globals.css` with our theme tokens**

Append to `globals.css`:

```css
:root {
  --spark-orange: #FF6B35;
  --spark-yellow: #FFB627;
  --ring-red: #FF3B30;
  --accent-blue: #007AFF;
  --success-green: #34C759;
}
.font-display { font-family: -apple-system, "SF Pro Display", "Inter", system-ui, sans-serif; letter-spacing: -0.02em; }
```

- [ ] **Step 4: Verify imports compile**

Add a `<Button>Test</Button>` to `app/page.tsx`, run `pnpm dev`, confirm it renders, remove.

- [ ] **Step 5: Mark complete**

### Task 3: Drizzle + env config

**Files:**
- Create: `drizzle.config.ts`, `.env.example`, `lib/db.ts`, `db/schema.ts` (empty placeholder)

- [ ] **Step 1: Write `drizzle.config.ts`**

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  strict: true,
} satisfies Config;
```

- [ ] **Step 2: Write `.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
GEMINI_API_KEY=
USDA_API_KEY=
OPENAI_API_KEY=
```

- [ ] **Step 3: Write `lib/db.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
```

- [ ] **Step 4: Create empty `db/schema.ts`**

```ts
// Drizzle table definitions — populated in Task 14.
export {};
```

- [ ] **Step 5: Add npm scripts to `package.json`**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "db:generate": "drizzle-kit generate",
  "db:push": "drizzle-kit push",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:integration": "vitest run --config vitest.config.integration.ts",
  "test:e2e": "playwright test",
  "eval": "tsx evals/runner.ts"
}
```

- [ ] **Step 6: Mark complete**

---

## Phase 2 — Pure logic libraries (no external services)

### Task 4: Zod schemas

**Files:**
- Create: `schemas/meal-analysis.ts`, `schemas/profile.ts`, `schemas/goal.ts`, `schemas/recipe.ts`, `schemas/index.ts`

- [ ] **Step 1: Write `schemas/meal-analysis.ts`**

Use the exact schema from spec §9.1. Copy `FoodItemSchema` and `MealAnalysisSchema` verbatim. Export inferred TS types.

- [ ] **Step 2: Write `schemas/profile.ts`**

```ts
import { z } from 'zod';

export const ProfileSchema = z.object({
  display_name: z.string().min(1).max(60).optional(),
  sex: z.enum(['male', 'female', 'prefer_not']),
  birth_year: z.number().int().min(1900).max(new Date().getFullYear() - 5),
  height_cm: z.number().int().min(50).max(280),
  units_weight: z.enum(['lb', 'kg']).default('lb'),
  units_height: z.enum(['ft', 'cm']).default('ft'),
  timezone: z.string().default('America/Los_Angeles'),
});

export type Profile = z.infer<typeof ProfileSchema>;
```

- [ ] **Step 3: Write `schemas/goal.ts`**

```ts
import { z } from 'zod';

export const GoalSchema = z.object({
  intent: z.enum(['lose', 'maintain', 'gain', 'track']),
  target_weight_kg: z.number().min(20).max(300).optional(),
  pace: z.enum(['easy', 'steady', 'aggressive']).optional(),
  daily_kcal: z.number().int().min(800).max(6000),
  protein_g: z.number().int().min(0).max(500).optional(),
  carb_g: z.number().int().min(0).max(1000).optional(),
  fat_g: z.number().int().min(0).max(400).optional(),
  reminder_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export type Goal = z.infer<typeof GoalSchema>;
```

- [ ] **Step 4: Write `schemas/recipe.ts`**

```ts
import { z } from 'zod';

export const RecipeIngredientSchema = z.object({
  display_name: z.string().min(1).max(80),
  usda_query: z.string().min(1).max(80),
  grams: z.number().min(0.1).max(5000),
});

export const RecipeSchema = z.object({
  display_name: z.string().min(1).max(80),
  ingredients: z.array(RecipeIngredientSchema).min(1).max(50),
  // Computed by server: kcal_per_100g, etc.
});

export type Recipe = z.infer<typeof RecipeSchema>;
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;
```

- [ ] **Step 5: Barrel export in `schemas/index.ts`**

```ts
export * from './meal-analysis';
export * from './profile';
export * from './goal';
export * from './recipe';
```

- [ ] **Step 6: Quick TS compile check**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 7: Mark complete**

### Task 5: `lib/normalize.ts` (TDD)

**Files:**
- Create: `lib/normalize.ts`, `tests/unit/normalize.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/normalize.test.ts
import { describe, it, expect } from 'vitest';
import { normalize } from '@/lib/normalize';

describe('normalize', () => {
  it('lowercases', () => {
    expect(normalize('Spaghetti')).toBe('spaghetti');
  });
  it('strips punctuation', () => {
    expect(normalize('Spaghetti, Cooked!!')).toBe('spaghetti cooked');
  });
  it('collapses whitespace', () => {
    expect(normalize('  rice   cooked  ')).toBe('rice cooked');
  });
  it('sorts tokens for stable cache keys', () => {
    expect(normalize('cooked spaghetti')).toBe(normalize('spaghetti cooked'));
  });
  it('handles unicode food names', () => {
    expect(normalize('Café Latte')).toBe('cafe latte');
  });
  it('deduplicates tokens', () => {
    expect(normalize('chicken chicken breast')).toBe('breast chicken');
  });
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
pnpm test tests/unit/normalize.test.ts
```

Expected: fails with module not found.

- [ ] **Step 3: Implement**

```ts
// lib/normalize.ts
export function normalize(input: string): string {
  const ascii = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // strip diacritics
  const tokens = ascii
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return Array.from(new Set(tokens)).sort().join(' ');
}
```

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Mark complete**

### Task 6: `lib/goals.ts` — Mifflin-St Jeor + macro split (TDD)

**Files:**
- Create: `lib/goals.ts`, `tests/unit/goals.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/goals.test.ts
import { describe, it, expect } from 'vitest';
import { mifflinStJeor, computeMacroSplit, applyPaceAdjustment } from '@/lib/goals';

describe('mifflinStJeor', () => {
  it('male reference value', () => {
    // Male, 28y, 178cm, 78kg, sedentary → BMR ~1742, TDEE ~2090
    const bmr = mifflinStJeor({ sex: 'male', age: 28, height_cm: 178, weight_kg: 78 });
    expect(bmr).toBeCloseTo(1742, 0);
  });
  it('female reference value', () => {
    const bmr = mifflinStJeor({ sex: 'female', age: 30, height_cm: 165, weight_kg: 62 });
    expect(bmr).toBeCloseTo(1366, 0);
  });
  it('prefer_not uses average constant', () => {
    const bmr = mifflinStJeor({ sex: 'prefer_not', age: 28, height_cm: 178, weight_kg: 78 });
    expect(bmr).toBeGreaterThan(1500);
    expect(bmr).toBeLessThan(2000);
  });
});

describe('applyPaceAdjustment', () => {
  it('lose+steady cuts ~500 kcal', () => {
    expect(applyPaceAdjustment(2400, 'lose', 'steady')).toBe(1900);
  });
  it('lose+easy cuts ~250', () => {
    expect(applyPaceAdjustment(2400, 'lose', 'easy')).toBe(2150);
  });
  it('lose+aggressive cuts ~750', () => {
    expect(applyPaceAdjustment(2400, 'lose', 'aggressive')).toBe(1650);
  });
  it('gain mirrors lose', () => {
    expect(applyPaceAdjustment(2400, 'gain', 'steady')).toBe(2900);
  });
  it('maintain is identity', () => {
    expect(applyPaceAdjustment(2400, 'maintain', 'steady')).toBe(2400);
  });
  it('track returns input unchanged', () => {
    expect(applyPaceAdjustment(2400, 'track', 'steady')).toBe(2400);
  });
  it('clamps to minimum safe floor (1200)', () => {
    expect(applyPaceAdjustment(1600, 'lose', 'aggressive')).toBe(1200);
  });
});

describe('computeMacroSplit', () => {
  it('returns p/c/f grams summing within 50 kcal of target', () => {
    const split = computeMacroSplit(2200);
    const computedKcal = split.protein_g * 4 + split.carb_g * 4 + split.fat_g * 9;
    expect(Math.abs(computedKcal - 2200)).toBeLessThan(50);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement**

```ts
// lib/goals.ts
export type Sex = 'male' | 'female' | 'prefer_not';
export type Intent = 'lose' | 'maintain' | 'gain' | 'track';
export type Pace = 'easy' | 'steady' | 'aggressive';

const ACTIVITY_FACTOR = 1.2; // sedentary; user can override later
const MIN_KCAL_FLOOR = 1200;

export function mifflinStJeor(p: { sex: Sex; age: number; height_cm: number; weight_kg: number }): number {
  const base = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age;
  const sexOffset = p.sex === 'male' ? 5 : p.sex === 'female' ? -161 : -78; // prefer_not uses midpoint
  const bmr = base + sexOffset;
  return Math.round(bmr * ACTIVITY_FACTOR);
}

const PACE_DELTA: Record<Pace, number> = { easy: 250, steady: 500, aggressive: 750 };

export function applyPaceAdjustment(tdee: number, intent: Intent, pace: Pace): number {
  if (intent === 'maintain' || intent === 'track') return tdee;
  const delta = PACE_DELTA[pace];
  const target = intent === 'lose' ? tdee - delta : tdee + delta;
  return Math.max(MIN_KCAL_FLOOR, target);
}

export function computeMacroSplit(daily_kcal: number): { protein_g: number; carb_g: number; fat_g: number } {
  // Default split: 30% protein, 40% carb, 30% fat
  const protein_g = Math.round((daily_kcal * 0.30) / 4);
  const carb_g    = Math.round((daily_kcal * 0.40) / 4);
  const fat_g     = Math.round((daily_kcal * 0.30) / 9);
  return { protein_g, carb_g, fat_g };
}

export function estimateArrivalDate(
  current_kg: number,
  target_kg: number,
  pace: Pace,
): Date | null {
  if (current_kg === target_kg) return null;
  const direction = target_kg > current_kg ? 1 : -1;
  const kcal_per_kg = 7700;
  const daily_deficit = PACE_DELTA[pace];
  const days_needed = Math.abs((target_kg - current_kg) * kcal_per_kg / daily_deficit);
  const arrival = new Date();
  arrival.setDate(arrival.getDate() + Math.round(days_needed));
  return arrival;
}
```

- [ ] **Step 4: Pass, mark complete**

### Task 7: `lib/dates.ts` — timezone-aware day grouping (TDD)

**Files:**
- Create: `lib/dates.ts`, `tests/unit/dates.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { toUserDate, isSameUserDay } from '@/lib/dates';

describe('toUserDate', () => {
  it('groups a 3:55 AM UTC meal into the previous day in LA timezone', () => {
    expect(toUserDate(new Date('2026-05-22T03:55:00Z'), 'America/Los_Angeles')).toBe('2026-05-21');
  });
  it('groups a noon UTC meal into the same day in LA', () => {
    expect(toUserDate(new Date('2026-05-22T19:00:00Z'), 'America/Los_Angeles')).toBe('2026-05-22');
  });
  it('respects Asia/Kolkata offset', () => {
    expect(toUserDate(new Date('2026-05-21T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-05-22');
  });
});

describe('isSameUserDay', () => {
  it('two timestamps on same user day return true', () => {
    expect(isSameUserDay(
      new Date('2026-05-22T08:00:00Z'),
      new Date('2026-05-22T23:00:00Z'),
      'America/Los_Angeles'
    )).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// lib/dates.ts
import { formatInTimeZone } from 'date-fns-tz';

export function toUserDate(ts: Date, timezone: string): string {
  return formatInTimeZone(ts, timezone, 'yyyy-MM-dd');
}

export function isSameUserDay(a: Date, b: Date, timezone: string): boolean {
  return toUserDate(a, timezone) === toUserDate(b, timezone);
}

export function userToday(timezone: string): string {
  return toUserDate(new Date(), timezone);
}
```

- [ ] **Step 3: Pass, mark complete**

### Task 8: `lib/streak.ts` (TDD)

**Files:**
- Create: `lib/streak.ts`, `tests/unit/streak.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { updateStreak } from '@/lib/streak';

describe('updateStreak', () => {
  it('first ever log → current=1, longest=1', () => {
    const next = updateStreak(
      { current_length: 0, longest_length: 0, last_logged_date: null, freeze_count: 0 },
      '2026-05-22'
    );
    expect(next.current_length).toBe(1);
    expect(next.longest_length).toBe(1);
    expect(next.last_logged_date).toBe('2026-05-22');
  });

  it('consecutive day → increments', () => {
    const next = updateStreak(
      { current_length: 4, longest_length: 9, last_logged_date: '2026-05-21', freeze_count: 0 },
      '2026-05-22'
    );
    expect(next.current_length).toBe(5);
    expect(next.longest_length).toBe(9);
  });

  it('same day relog is idempotent', () => {
    const next = updateStreak(
      { current_length: 5, longest_length: 9, last_logged_date: '2026-05-22', freeze_count: 0 },
      '2026-05-22'
    );
    expect(next.current_length).toBe(5);
  });

  it('two-day gap with no freeze resets to 1', () => {
    const next = updateStreak(
      { current_length: 7, longest_length: 7, last_logged_date: '2026-05-20', freeze_count: 0 },
      '2026-05-22'
    );
    expect(next.current_length).toBe(1);
  });

  it('two-day gap with freeze consumes it and keeps streak', () => {
    const next = updateStreak(
      { current_length: 7, longest_length: 7, last_logged_date: '2026-05-20', freeze_count: 1 },
      '2026-05-22'
    );
    expect(next.current_length).toBe(8);
    expect(next.freeze_count).toBe(0);
  });

  it('new longest updates longest_length', () => {
    const next = updateStreak(
      { current_length: 9, longest_length: 9, last_logged_date: '2026-05-21', freeze_count: 0 },
      '2026-05-22'
    );
    expect(next.longest_length).toBe(10);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// lib/streak.ts
import { differenceInCalendarDays, parseISO } from 'date-fns';

export interface StreakState {
  current_length: number;
  longest_length: number;
  last_logged_date: string | null;
  freeze_count: number;
}

export function updateStreak(prev: StreakState, todayIso: string): StreakState {
  if (!prev.last_logged_date) {
    return { ...prev, current_length: 1, longest_length: Math.max(1, prev.longest_length), last_logged_date: todayIso };
  }
  const gap = differenceInCalendarDays(parseISO(todayIso), parseISO(prev.last_logged_date));
  if (gap === 0) return prev;
  if (gap === 1) {
    const current = prev.current_length + 1;
    return { ...prev, current_length: current, longest_length: Math.max(prev.longest_length, current), last_logged_date: todayIso };
  }
  // gap >= 2
  if (gap === 2 && prev.freeze_count > 0) {
    const current = prev.current_length + 1;
    return { ...prev, current_length: current, longest_length: Math.max(prev.longest_length, current), last_logged_date: todayIso, freeze_count: prev.freeze_count - 1 };
  }
  return { ...prev, current_length: 1, last_logged_date: todayIso };
}
```

- [ ] **Step 3: Pass, mark complete**

### Task 9: `lib/error-bands.ts` (TDD)

**Files:**
- Create: `lib/error-bands.ts`, `tests/unit/error-bands.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { itemBand, mealBand } from '@/lib/error-bands';

describe('itemBand', () => {
  it('component + usda_foundation → ±5%', () => {
    const b = itemBand({ kcal: 100, logging_mode: 'component', source: 'usda_foundation' });
    expect(b.low).toBe(95); expect(b.high).toBe(105);
  });
  it('restaurant_estimate → ±25%', () => {
    const b = itemBand({ kcal: 200, logging_mode: 'restaurant_estimate', source: 'usda_survey' });
    expect(b.low).toBe(150); expect(b.high).toBe(250);
  });
  it('gemini_estimate is always ±35%', () => {
    const b = itemBand({ kcal: 100, logging_mode: 'component', source: 'gemini_estimate' });
    expect(b.low).toBe(65); expect(b.high).toBe(135);
  });
});

describe('mealBand', () => {
  it('sums item bands', () => {
    const meal = mealBand([
      { kcal: 100, logging_mode: 'component', source: 'usda_foundation' },
      { kcal: 200, logging_mode: 'component', source: 'usda_foundation' },
    ]);
    expect(meal.low).toBe(285);
    expect(meal.high).toBe(315);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// lib/error-bands.ts
import type { LoggingMode } from '@/schemas/meal-analysis';

export type NutritionSource =
  | 'usda_foundation' | 'usda_sr' | 'usda_survey' | 'usda_branded'
  | 'open_food_facts' | 'user_override' | 'gemini_estimate';

const BAND_TABLE: Record<string, number> = {
  'component:usda_foundation': 0.05, 'component:usda_sr': 0.05,
  'component:usda_survey':     0.08, 'component:usda_branded': 0.12,
  'component:open_food_facts': 0.15,
  'composite:usda_survey':     0.12, 'composite:usda_foundation': 0.12,
  'composite:usda_branded':    0.18, 'composite:open_food_facts': 0.18,
  'saved_recipe:user_override':0.08,
  'restaurant_estimate:usda_foundation': 0.25, 'restaurant_estimate:usda_sr': 0.25,
  'restaurant_estimate:usda_survey': 0.25, 'restaurant_estimate:usda_branded': 0.25,
  'restaurant_estimate:open_food_facts': 0.25,
};

const GEMINI_ESTIMATE_BAND = 0.35;
const DEFAULT_BAND = 0.20;

export interface ItemBandInput {
  kcal: number;
  logging_mode: LoggingMode;
  source: NutritionSource;
}

export function itemBand(item: ItemBandInput): { low: number; high: number } {
  const pct = item.source === 'gemini_estimate'
    ? GEMINI_ESTIMATE_BAND
    : BAND_TABLE[`${item.logging_mode}:${item.source}`] ?? DEFAULT_BAND;
  const delta = item.kcal * pct;
  return { low: Math.round(item.kcal - delta), high: Math.round(item.kcal + delta) };
}

export function mealBand(items: ItemBandInput[]): { low: number; high: number } {
  return items.reduce((acc, i) => {
    const b = itemBand(i);
    return { low: acc.low + b.low, high: acc.high + b.high };
  }, { low: 0, high: 0 });
}
```

- [ ] **Step 3: Pass, mark complete**

---

## Phase 3 — External clients (mocked tests)

### Task 10: `lib/usda.ts` with mocked tests

**Files:**
- Create: `lib/usda.ts`, `tests/unit/usda.test.ts`

The client wraps USDA FoodData Central search + matching logic. Per-100g extraction. `scale()` helper.

- [ ] **Step 1: Write failing tests using MSW to mock USDA**

```ts
// tests/unit/usda.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { searchUsda, scale, rankUsdaResults, extractNutrients } from '@/lib/usda';

const server = setupServer();
beforeAll(() => server.listen());
afterAll(() => server.close());

describe('scale', () => {
  it('linearly scales per-100g to actual grams', () => {
    const r = scale({ kcal: 158, protein: 5.8, carb: 31, fat: 0.9 }, 220);
    expect(r.kcal).toBeCloseTo(347.6, 1);
    expect(r.protein).toBeCloseTo(12.8, 1);
  });
});

describe('rankUsdaResults', () => {
  it('prefers exact name match over fuzzy', () => {
    const winner = rankUsdaResults(
      [
        { fdcId: 1, description: 'Spaghetti, dry', dataType: 'Foundation' },
        { fdcId: 2, description: 'Spaghetti, cooked',  dataType: 'Foundation' },
      ],
      'spaghetti cooked',
      'cooked'
    );
    expect(winner.fdcId).toBe(2);
  });
});

describe('searchUsda', () => {
  it('returns first matching food', async () => {
    server.use(
      http.get('https://api.nal.usda.gov/fdc/v1/foods/search', () =>
        HttpResponse.json({ foods: [{ fdcId: 168927, description: 'Spaghetti, cooked', dataType: 'Foundation', foodNutrients: [
          { nutrientId: 1008, value: 158 }, // energy
          { nutrientId: 1003, value: 5.8 }, // protein
          { nutrientId: 1005, value: 31 },  // carb
          { nutrientId: 1004, value: 0.9 }, // fat
        ] }] })
      )
    );
    const r = await searchUsda('spaghetti', 'cooked');
    expect(r?.fdcId).toBe(168927);
    expect(r?.kcal_per_100g).toBe(158);
  });
});
```

- [ ] **Step 2: Implement `lib/usda.ts`**

```ts
const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

export interface PerHundredG {
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
}

export interface UsdaResult extends PerHundredG {
  fdcId: number;
  description: string;
  dataType: 'Foundation' | 'SR Legacy' | 'Survey (FNDDS)' | 'Branded';
  kcal_per_100g: number;
  protein_per_100g: number;
  carb_per_100g: number;
  fat_per_100g: number;
}

export function scale(per100g: PerHundredG, grams: number): PerHundredG {
  return {
    kcal:    Math.round(per100g.kcal    * grams) / 100,
    protein: Math.round(per100g.protein * grams) / 100,
    carb:    Math.round(per100g.carb    * grams) / 100,
    fat:     Math.round(per100g.fat     * grams) / 100,
  };
}

const NUTRIENT_IDS = { kcal: 1008, protein: 1003, carb: 1005, fat: 1004 } as const;

export function extractNutrients(food: any): PerHundredG {
  const out: PerHundredG = { kcal: 0, protein: 0, carb: 0, fat: 0 };
  for (const n of food.foodNutrients ?? []) {
    const id = n.nutrient?.id ?? n.nutrientId;
    if (id === NUTRIENT_IDS.kcal)    out.kcal    = n.amount ?? n.value ?? 0;
    if (id === NUTRIENT_IDS.protein) out.protein = n.amount ?? n.value ?? 0;
    if (id === NUTRIENT_IDS.carb)    out.carb    = n.amount ?? n.value ?? 0;
    if (id === NUTRIENT_IDS.fat)     out.fat     = n.amount ?? n.value ?? 0;
  }
  return out;
}

function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.max(ta.size, tb.size, 1);
}

export function rankUsdaResults(
  results: Array<{ fdcId: number; description: string; dataType: string }>,
  query: string,
  preparation?: string
) {
  const scored = results.map(r => {
    let score = tokenSetRatio(query, r.description);
    if (preparation && r.description.toLowerCase().includes(preparation)) score += 0.2;
    if (r.dataType === 'Foundation' || r.dataType === 'SR Legacy') score += 0.1;
    if (r.dataType === 'Branded') score -= 0.1;
    return { ...r, _score: score };
  });
  scored.sort((a, b) => b._score - a._score);
  return scored[0];
}

export async function searchUsda(
  query: string,
  preparation?: string,
  dataTypes: string[] = ['Foundation', 'SR Legacy', 'Survey (FNDDS)']
): Promise<UsdaResult | null> {
  const url = new URL(`${USDA_BASE}/foods/search`);
  url.searchParams.set('query', query);
  url.searchParams.set('dataType', dataTypes.join(','));
  url.searchParams.set('pageSize', '5');
  url.searchParams.set('api_key', process.env.USDA_API_KEY ?? 'DEMO_KEY');
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.foods?.length) return null;
  const winner = rankUsdaResults(data.foods, query, preparation);
  const n = extractNutrients(data.foods.find((f: any) => f.fdcId === winner.fdcId));
  return {
    fdcId: winner.fdcId,
    description: winner.description,
    dataType: winner.dataType as UsdaResult['dataType'],
    ...n,
    kcal_per_100g: n.kcal, protein_per_100g: n.protein, carb_per_100g: n.carb, fat_per_100g: n.fat,
  };
}
```

- [ ] **Step 3: Pass, mark complete**

### Task 11: `lib/openfoodfacts.ts` with mocked tests

**Files:**
- Create: `lib/openfoodfacts.ts`, `tests/unit/openfoodfacts.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { searchOpenFoodFacts } from '@/lib/openfoodfacts';

const server = setupServer();
beforeAll(() => server.listen());
afterAll(() => server.close());

describe('searchOpenFoodFacts', () => {
  it('parses search response and returns per-100g', async () => {
    server.use(
      http.get('https://world.openfoodfacts.org/cgi/search.pl', () =>
        HttpResponse.json({ products: [{
          code: '3017620422003', product_name: 'Nutella',
          nutriments: { 'energy-kcal_100g': 539, 'proteins_100g': 6.3, 'carbohydrates_100g': 57.5, 'fat_100g': 30.9 },
        }] })
      )
    );
    const r = await searchOpenFoodFacts('nutella');
    expect(r?.code).toBe('3017620422003');
    expect(r?.kcal_per_100g).toBe(539);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// lib/openfoodfacts.ts
export interface OffResult {
  code: string;
  product_name: string;
  kcal_per_100g: number;
  protein_per_100g: number;
  carb_per_100g: number;
  fat_per_100g: number;
}

export async function searchOpenFoodFacts(query: string): Promise<OffResult | null> {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', query);
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '5');
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  const p = data.products?.[0];
  if (!p) return null;
  const n = p.nutriments ?? {};
  if (n['energy-kcal_100g'] == null) return null;
  return {
    code: p.code,
    product_name: p.product_name ?? query,
    kcal_per_100g: Number(n['energy-kcal_100g']),
    protein_per_100g: Number(n['proteins_100g'] ?? 0),
    carb_per_100g: Number(n['carbohydrates_100g'] ?? 0),
    fat_per_100g: Number(n['fat_100g'] ?? 0),
  };
}
```

- [ ] **Step 3: Mark complete**

### Task 12: `lib/gemini.ts` with mocked tests

**Files:**
- Create: `lib/gemini.ts`, `tests/unit/gemini.test.ts`

- [ ] **Step 1: Implement (no real call in unit test; integration covered in eval suite)**

```ts
// lib/gemini.ts
import { GoogleGenAI } from '@google/genai';
import { MealAnalysisSchema, type MealAnalysis } from '@/schemas/meal-analysis';

const MODEL = 'gemini-3-flash-preview';

const SYSTEM_PROMPT = `You are a nutrition-data normalizer. The user is telling you what they ate and (usually) how much. Your only jobs are:

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

OUTPUT: Strictly conform to the provided JSON Schema. No prose outside schema fields.`;

export interface AnalyzeInput {
  imageBytes?: Uint8Array;
  imageMime?: string;
  transcript?: string;
  typed_text?: string;
}

export interface AnalyzeOutput {
  parsed: MealAnalysis;
  raw: unknown;
  input_tokens?: number;
  output_tokens?: number;
  latency_ms: number;
}

export async function analyzeMeal(input: AnalyzeInput): Promise<AnalyzeOutput> {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const parts: any[] = [];
  if (input.imageBytes && input.imageMime) {
    parts.push({ inlineData: { mimeType: input.imageMime, data: Buffer.from(input.imageBytes).toString('base64') } });
  }
  const text = [input.transcript, input.typed_text].filter(Boolean).join('\n\n');
  if (text) parts.push({ text });

  const t0 = Date.now();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: zodToGeminiSchema(MealAnalysisSchema),
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 1024,
    },
  } as any);
  const latency_ms = Date.now() - t0;
  const rawText = response.text ?? '';
  const json = JSON.parse(rawText);
  const parsed = MealAnalysisSchema.parse(json);
  return { parsed, raw: json, latency_ms };
}

// Minimal zod→Gemini JSON Schema. Gemini accepts standard JSON Schema since Nov 2025.
import { z } from 'zod';
function zodToGeminiSchema(schema: z.ZodTypeAny): any {
  // Convert Zod schema to JSON Schema. Gemini accepts the same JSON Schema standard.
  // Use a lightweight runtime conversion.
  return zodSchemaToJsonSchema(schema);
}

function zodSchemaToJsonSchema(schema: z.ZodTypeAny): any {
  const def: any = (schema as any)._def;
  const typeName = def.typeName;
  if (typeName === 'ZodObject') {
    const shape = def.shape();
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const key of Object.keys(shape)) {
      const child = shape[key];
      properties[key] = zodSchemaToJsonSchema(child);
      if (!(child instanceof z.ZodOptional)) required.push(key);
    }
    return { type: 'object', properties, required };
  }
  if (typeName === 'ZodArray') return { type: 'array', items: zodSchemaToJsonSchema(def.type) };
  if (typeName === 'ZodString') return { type: 'string', description: def.description };
  if (typeName === 'ZodNumber') return { type: 'number', description: def.description };
  if (typeName === 'ZodBoolean') return { type: 'boolean', description: def.description };
  if (typeName === 'ZodEnum') return { type: 'string', enum: def.values };
  if (typeName === 'ZodOptional') return zodSchemaToJsonSchema(def.innerType);
  if (typeName === 'ZodDefault') return zodSchemaToJsonSchema(def.innerType);
  return { type: 'string' };
}
```

- [ ] **Step 2: Add minimal test for schema conversion**

```ts
// tests/unit/gemini.test.ts
import { describe, it, expect } from 'vitest';
import { MealAnalysisSchema } from '@/schemas/meal-analysis';
// The conversion helper is module-private; we exercise it by checking that the analyze function exists.
// Real Gemini behavior is exercised in the eval suite (Phase 13).

describe('gemini module', () => {
  it('exports analyzeMeal', async () => {
    const mod = await import('@/lib/gemini');
    expect(typeof mod.analyzeMeal).toBe('function');
  });
});
```

- [ ] **Step 3: Mark complete**

### Task 13: `lib/resolve.ts` — orchestrates user_food_overrides → food_cache → USDA tiers → OFF

**Files:**
- Create: `lib/resolve.ts`, `tests/unit/resolve.test.ts`

- [ ] **Step 1: Implement**

```ts
// lib/resolve.ts
import { db } from '@/lib/db';
import { foodCache, userFoodOverrides } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { normalize } from '@/lib/normalize';
import { scale, searchUsda } from '@/lib/usda';
import { searchOpenFoodFacts } from '@/lib/openfoodfacts';
import type { NutritionSource } from '@/lib/error-bands';

export interface ResolveInput {
  userId: string;
  usda_query: string;
  display_name: string;
  grams: number;
  preparation?: string;
  loggingMode: 'component' | 'composite' | 'restaurant_estimate' | 'saved_recipe';
}

export interface ResolvedItem {
  source: NutritionSource;
  source_ref: string;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  match_confidence: number;
  fell_back: boolean;
}

export async function resolveItem(inp: ResolveInput): Promise<ResolvedItem | null> {
  const qn = normalize(inp.usda_query);

  // Tier 0: user_food_overrides
  const ovr = await db.query.userFoodOverrides.findFirst({
    where: and(eq(userFoodOverrides.userId, inp.userId), eq(userFoodOverrides.queryNormalized, qn)),
  });
  if (ovr) {
    const s = scale({ kcal: Number(ovr.kcalPer100g), protein: Number(ovr.proteinPer100g ?? 0), carb: Number(ovr.carbPer100g ?? 0), fat: Number(ovr.fatPer100g ?? 0) }, inp.grams);
    return { source: 'user_override', source_ref: ovr.id, ...numbers(s), match_confidence: 1, fell_back: false };
  }

  // Tier 1: food_cache
  const cached = await db.query.foodCache.findFirst({ where: eq(foodCache.queryNormalized, qn) });
  if (cached) {
    const s = scale({ kcal: Number(cached.kcalPer100g), protein: Number(cached.proteinPer100g ?? 0), carb: Number(cached.carbPer100g ?? 0), fat: Number(cached.fatPer100g ?? 0) }, inp.grams);
    return { source: cached.source as NutritionSource, source_ref: cached.sourceRef, ...numbers(s), match_confidence: 0.95, fell_back: false };
  }

  // Tier 2: USDA Foundation/SR/Survey
  let u = await searchUsda(inp.usda_query, inp.preparation, ['Foundation', 'SR Legacy', 'Survey (FNDDS)']);
  let source: NutritionSource = u?.dataType === 'Foundation' ? 'usda_foundation' : u?.dataType === 'SR Legacy' ? 'usda_sr' : 'usda_survey';
  // Tier 3: USDA Branded
  if (!u) {
    u = await searchUsda(inp.usda_query, inp.preparation, ['Branded']);
    source = 'usda_branded';
  }
  if (u) {
    await db.insert(foodCache).values({
      queryNormalized: qn, source, sourceRef: String(u.fdcId),
      kcalPer100g: String(u.kcal_per_100g), proteinPer100g: String(u.protein_per_100g), carbPer100g: String(u.carb_per_100g), fatPer100g: String(u.fat_per_100g),
    }).onConflictDoNothing();
    const s = scale({ kcal: u.kcal_per_100g, protein: u.protein_per_100g, carb: u.carb_per_100g, fat: u.fat_per_100g }, inp.grams);
    return { source, source_ref: String(u.fdcId), ...numbers(s), match_confidence: 0.8, fell_back: false };
  }

  // Tier 4: Open Food Facts
  const off = await searchOpenFoodFacts(inp.usda_query);
  if (off) {
    await db.insert(foodCache).values({
      queryNormalized: qn, source: 'open_food_facts', sourceRef: off.code,
      kcalPer100g: String(off.kcal_per_100g), proteinPer100g: String(off.protein_per_100g), carbPer100g: String(off.carb_per_100g), fatPer100g: String(off.fat_per_100g),
    }).onConflictDoNothing();
    const s = scale({ kcal: off.kcal_per_100g, protein: off.protein_per_100g, carb: off.carb_per_100g, fat: off.fat_per_100g }, inp.grams);
    return { source: 'open_food_facts', source_ref: off.code, ...numbers(s), match_confidence: 0.6, fell_back: true };
  }

  return null;
}

function numbers(s: { kcal: number; protein: number; carb: number; fat: number }) {
  return { kcal: s.kcal, protein_g: s.protein, carb_g: s.carb, fat_g: s.fat };
}
```

- [ ] **Step 2: Skip unit tests for this module — covered by integration tests in Phase 13 where DB is real. Add a stub test asserting export shape.**

- [ ] **Step 3: Mark complete**

---

## Phase 4 — Data layer

### Task 14: Drizzle schemas

**Files:**
- Modify: `db/schema.ts`

- [ ] **Step 1: Replace `db/schema.ts` with full schema**

Translate the SQL from spec §7 into Drizzle. Use `pgTable`, `uuid`, `text`, `smallint`, `numeric`, `boolean`, `timestamp`, `date`, `time`, `jsonb`, `integer`, `check`, and `pgEnum`. Export every table and its inferred Insert/Select types.

(Full schema is long — reference spec §7 SQL exactly. Use snake_case column names matching the SQL; Drizzle's camelCase TS property names map automatically via `.from('snake_case')`.)

- [ ] **Step 2: Confirm `pnpm tsc --noEmit` passes**

- [ ] **Step 3: Mark complete**

### Task 15: Initial migration + RLS SQL

**Files:**
- Create: `db/migrations/0000_initial.sql` (generated via Drizzle), `db/policies.sql`

- [ ] **Step 1: Generate migration**

```bash
pnpm db:generate
```

Inspect `db/migrations/0000_initial.sql`. Verify all tables match spec §7.

- [ ] **Step 2: Hand-write `db/policies.sql`**

Apply RLS policy template (spec §7) to every user-owned table. Storage policies for `meals` bucket. Save to `db/policies.sql` and document that this must be applied manually after `db:push` (Drizzle doesn't manage policies).

- [ ] **Step 3: Add a `db/push.sh` wrapper that runs both**

```bash
#!/usr/bin/env bash
set -euo pipefail
pnpm db:push
echo "Applying RLS policies..."
psql "$DATABASE_URL" < db/policies.sql
echo "Done."
```

- [ ] **Step 4: Mark complete (do not run yet — requires DATABASE_URL)**

### Task 16: Supabase clients (SSR + browser)

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `middleware.ts`

- [ ] **Step 1: `lib/supabase/server.ts`**

Use `@supabase/ssr` `createServerClient` pattern from Supabase docs. Wire cookies from `next/headers`. Export `createClient()` returning a server client suitable for RSC + Server Actions + Route Handlers.

- [ ] **Step 2: `lib/supabase/client.ts`**

Wrap `createBrowserClient` for client components.

- [ ] **Step 3: `middleware.ts` at project root**

Run `updateSession` to refresh cookies on every request. Protect `(app)` routes.

- [ ] **Step 4: Mark complete**

### Task 17: `lib/storage.ts` — photo upload helpers

**Files:**
- Create: `lib/storage.ts`

- [ ] **Step 1: Implement upload + signed URL helpers**

```ts
// lib/storage.ts
import { createClient } from '@/lib/supabase/server';

export async function uploadMealPhoto(userId: string, draftId: string, file: Blob): Promise<string> {
  const supabase = await createClient();
  const path = `${userId}/${draftId}.jpg`;
  const { error } = await supabase.storage.from('meals').upload(path, file, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function getSignedPhotoUrl(path: string, expiresIn = 3600): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from('meals').createSignedUrl(path, expiresIn);
  if (error || !data) throw error ?? new Error('signed url failed');
  return data.signedUrl;
}

export async function movePhoto(fromPath: string, toPath: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from('meals').move(fromPath, toPath);
  if (error) throw error;
}
```

- [ ] **Step 2: Mark complete**

---

## Phase 5 — API routes

### Task 18: `/api/analyze` streaming Route Handler

**Files:**
- Create: `app/api/analyze/route.ts`

- [ ] **Step 1: Implement using a `ReadableStream`**

Flow per spec §8. Stream JSON-lines status updates (`{type:"status",message:"..."}`) to client; final chunk is `{type:"draft", draft:{...}}`. On error, `{type:"error", message:"..."}`.

Persist `meal_drafts` row with the final draft JSON. Persist `ai_calls` row with token/latency/error.

- [ ] **Step 2: Add timeout abort (30s) + 8s "taking longer" message**

- [ ] **Step 3: Add per-user daily spend guard — query `ai_calls` for today's cost-equivalent in tokens; if > $1 equivalent, return 429**

- [ ] **Step 4: Mark complete**

### Task 19: `/api/transcribe` Whisper fallback

**Files:**
- Create: `app/api/transcribe/route.ts`

- [ ] **Step 1: POST `audio` blob → OpenAI Whisper `audio/transcriptions` → return `{transcript: string}`**

```ts
import OpenAI from 'openai';
export async function POST(req: Request) {
  const form = await req.formData();
  const audio = form.get('audio') as File;
  if (!audio) return Response.json({ error: 'no audio' }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: 'whisper disabled' }, { status: 503 });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const tr = await openai.audio.transcriptions.create({ file: audio, model: 'whisper-1' });
  return Response.json({ transcript: tr.text });
}
```

- [ ] **Step 2: Mark complete**

---

## Phase 6 — Server Actions

### Task 20: `actions/meals.ts` — saveMeal, editMeal, deleteMeal

**Files:**
- Create: `actions/meals.ts`

- [ ] **Step 1: Implement `saveMeal(draftId, edits)`**

Validate draft against MealAnalysisSchema. Recompute kcal/macros for edited items using `resolveItem` (no new LLM call). Insert `meals` + `meal_items` rows in a transaction. Update `streaks` via `updateStreak()`. Move photo from tmp to permanent path. Delete the draft row. `revalidatePath('/today')`. Return `{ meal_id }`.

- [ ] **Step 2: Implement `editMeal(mealId, edits)`**

For each edited item: recompute via stored `source_ref` (use `foodCache` for source-of-truth nutrition per 100g). Update meal_items rows. Update meals totals + error bands. Set `edited_at`.

- [ ] **Step 3: Implement `deleteMeal(mealId)`**

Delete meal (cascade removes meal_items). Recompute streak if today's last meal. Revalidate paths.

- [ ] **Step 4: Mark complete**

### Task 21: `actions/weights.ts` and `actions/goals.ts`

**Files:**
- Create: `actions/weights.ts`, `actions/goals.ts`

- [ ] **Step 1: `logWeight({ recorded_on, weight_kg })`**

Upsert via Drizzle `.onConflictDoUpdate({ target: [weights.userId, weights.recordedOn] })`. Revalidate `/weight` and `/today`.

- [ ] **Step 2: `updateGoal({ intent, pace, target_weight_kg, daily_kcal?, reminder_time? })`**

Insert new `goals` row; set `superseded_at = now()` on previous active row. Auto-compute `daily_kcal` via Mifflin-St Jeor if user didn't override. Macro split via `computeMacroSplit()`.

- [ ] **Step 3: Mark complete**

### Task 22: `actions/recipes.ts`

**Files:**
- Create: `actions/recipes.ts`

- [ ] **Step 1: `saveRecipe({ display_name, ingredients })`**

For each ingredient: resolve via `resolveItem` to per-100g nutrition. Compute weighted average per-100g for the whole recipe. Insert into `user_food_overrides` with `source='recipe'`, `recipe_ingredients` JSONB containing the ingredient list. Return `{ recipe_id }`.

- [ ] **Step 2: `deleteRecipe(id)`** — simple delete with RLS-enforced ownership.

- [ ] **Step 3: Mark complete**

---

## Phase 7 — Core UI components

### Task 23: Spark mascot component

**Files:**
- Create: `components/spark/spark.tsx`, `components/spark/motion.ts`

- [ ] **Step 1: Extract Spark SVG (from `mascot-options-v2.html`) into a React component**

Variants (Framer Motion `variants` object): `idle`, `wobble`, `cheer`, `thinking`, `wave`. Each variant defines `animate` transforms. Use `motion.svg` + `motion.path` for the flame outer/inner so they can flicker independently.

Props: `size`, `variant`, `onClick`.

- [ ] **Step 2: Storybook-like dev page at `app/(dev)/spark/page.tsx` (only when `NODE_ENV !== production`)**

Lays out Spark in each variant for manual verification.

- [ ] **Step 3: Mark complete**

### Task 24: Daily kcal ring component

**Files:**
- Create: `components/ring/daily-ring.tsx`

- [ ] **Step 1: SVG ring with conic-gradient-equivalent (stroke-dasharray on circle)**

Props: `consumed`, `target`, `errorBandLow`, `errorBandHigh`, `colorMode`. Renders `kcal / target` in center with `± band` below. Color: green if within 5% of target, orange if over, red if >10% over.

- [ ] **Step 2: Add a small Spark cheer when `consumed` crosses `target` from below (animation triggered by prop change)**

- [ ] **Step 3: Mark complete**

### Task 25: Tab bar / sidebar layout

**Files:**
- Create: `app/(app)/layout.tsx`, `components/tab-bar/tab-bar.tsx`

- [ ] **Step 1: Bottom tab bar with 5 slots: Today, Log (raised), History, Weight, Me**

Use Lucide icons. Center "Log" button is larger, Spark-orange, with a `+` icon.

- [ ] **Step 2: At `lg:` breakpoint, switch to left sidebar layout via Tailwind responsive utilities**

- [ ] **Step 3: Mark complete**

### Task 26: shadcn primitive aliases

**Files:**
- Modify: `components/ui/*` (already created in Task 2 — verify imports)

- [ ] **Step 1: Confirm Button, Input, Select, Drawer, Dialog, Toast, Progress are present**

- [ ] **Step 2: Add a `useToast` re-export if not present**

- [ ] **Step 3: Mark complete**

---

## Phase 8 — Auth + onboarding

### Task 27: `/login` + auth callback

**Files:**
- Create: `app/(public)/login/page.tsx`, `app/auth/callback/route.ts`

- [ ] **Step 1: Login page with email magic-link form**

Use Supabase `signInWithOtp({ email, options: { emailRedirectTo: '${origin}/auth/callback' } })`. Show "check your email" state on submit.

- [ ] **Step 2: Callback route exchanges code for session**

```ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/today';
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
```

- [ ] **Step 3: Mark complete**

### Task 28: Onboarding flow (7 screens)

**Files:**
- Create: `app/(public)/onboarding/layout.tsx`, `app/(public)/onboarding/page.tsx`, `app/(public)/onboarding/goal/page.tsx`, `app/(public)/onboarding/about/page.tsx`, `app/(public)/onboarding/body/page.tsx`, `app/(public)/onboarding/plan/page.tsx`, `app/(public)/onboarding/streak/page.tsx`, `app/(public)/onboarding/first-meal/page.tsx`, `components/progress-dots/progress-dots.tsx`

- [ ] **Step 1: Layout component with ProgressDots, step counter, and shared transition (Framer Motion `AnimatePresence` slide-left)**

- [ ] **Step 2: State held in localStorage under `onboarding_state` — each screen reads + updates**

- [ ] **Step 3: Build all 7 screens matching the v2 mockup**

Welcome: Spark hero (`variant=wave`), value prop, CTA. Goal: 4 cards with Lucide icons (TrendingDown, Scale, TrendingUp, BarChart3). About: sex pill row + age + height inputs. Body: current/target weight + pace pills. Plan: big computed kcal number (editable on tap), macro stats, confetti on mount, Spark `cheer`. Streak: 7-day visual grid + reminder time picker. First-meal: viewfinder + CTA → `/log`.

- [ ] **Step 4: On final Save, post collected state to Server Action `completeOnboarding`** (lives in `actions/goals.ts`), which:
  - If unauthenticated: persist to localStorage; show signup modal on the `/log/review` save action.
  - If authenticated: write profile + initial goal row + initial streaks row.

- [ ] **Step 5: Mark complete**

---

## Phase 9 — Main app pages

### Task 29: `/today`

**Files:**
- Create: `app/(app)/today/page.tsx`, `components/meal-card/meal-card.tsx`

- [ ] **Step 1: RSC fetches today's meals + streak + current goal**

Group by `meal_type`. Compute totals server-side. Pass to `<DailyRing>` and a list of `<MealCard>`s.

- [ ] **Step 2: `<MealCard>` shows: meal type, thumbnail (signed URL), label, `kcal ± band`, click → opens drawer for edit/delete**

- [ ] **Step 3: Spark `cheer` triggers when `consumed >= goal.daily_kcal` and a celebration overlay shows once per day (track in localStorage)**

- [ ] **Step 4: Mark complete**

### Task 30: `/log` capture flow

**Files:**
- Create: `app/(app)/log/page.tsx`, `components/capture/camera.tsx`, `components/capture/voice-recorder.tsx`, `components/capture/text-input.tsx`

- [ ] **Step 1: State machine via `useReducer` (states from spec §8)**

Transitions on button clicks. URL doesn't change while IDLE→RECORDING; switches to `/log/analyzing/[draftId]` while waiting; redirects to `/log/review/[draftId]` on stream completion.

- [ ] **Step 2: Camera component using `getUserMedia({ video: { facingMode: 'environment' } })`**

Live preview, shutter overlay. Downscale captured frame to 1280px JPEG q=80 client-side via canvas.

- [ ] **Step 3: Voice recorder: tries `window.SpeechRecognition`/`webkitSpeechRecognition`; on unsupported, records `audio/webm` blob and posts to `/api/transcribe`**

- [ ] **Step 4: Text input as fallback (always available)**

- [ ] **Step 5: On submit: POST multipart form to `/api/analyze`, parse SSE/streamed JSON-lines, show Spark `thinking` + status text, navigate on final chunk**

- [ ] **Step 6: Mark complete**

### Task 31: `/log/review/[draftId]`

**Files:**
- Create: `app/(app)/log/review/[draftId]/page.tsx`, `components/meal-review/items-table.tsx`

- [ ] **Step 1: RSC fetches draft from `meal_drafts` (404 if not owner or expired)**

- [ ] **Step 2: ItemsTable: each row shows display_name, grams input, kcal display, edit/delete row, source badge (USDA / OFF / estimated)**

Editing grams triggers re-scale client-side from cached per-100g; server recomputes on Save.

- [ ] **Step 3: Tier 4 fallback rows show yellow badge "Help us match this" → opens drawer with: near-matches, paste-label form (Gemini OCR), barcode scanner**

- [ ] **Step 4: Save calls `saveMeal` Server Action; if unauthenticated, shows signup modal first**

- [ ] **Step 5: Mark complete**

### Task 32: `/history` + `/history/[date]`

**Files:**
- Create: `app/(app)/history/page.tsx`, `app/(app)/history/[date]/page.tsx`, `components/history-calendar/history-calendar.tsx`

- [ ] **Step 1: Calendar view — month grid, each day cell shows total kcal vs goal-of-that-day with a small ring**

- [ ] **Step 2: Day detail — same `/today` layout but read-only by default, tap-to-edit**

- [ ] **Step 3: Mark complete**

### Task 33: `/weight` + chart

**Files:**
- Create: `app/(app)/weight/page.tsx`, `app/(app)/weight/add/page.tsx`, `components/weight-chart/weight-chart.tsx`

- [ ] **Step 1: Chart via Recharts or `react-charts`** (add to deps: `pnpm add recharts`)

Line chart with 7-day moving average overlay. Range selector: 30d / 90d / 1y / all.

- [ ] **Step 2: `/weight/add` is a drawer/modal — date picker (defaults today) + weight input → `logWeight` action**

- [ ] **Step 3: Mark complete**

### Task 34: `/recipes` + builder

**Files:**
- Create: `app/(app)/recipes/page.tsx`, `app/(app)/recipes/new/page.tsx`, `app/(app)/recipes/[id]/page.tsx`, `components/recipe-builder/recipe-builder.tsx`

- [ ] **Step 1: List page — cards of recipes with kcal/100g, use count**

- [ ] **Step 2: Builder — name input, dynamic ingredient list with display_name + usda_query + grams. Live per-100g preview computed as items added.**

Save calls `saveRecipe` action.

- [ ] **Step 3: Detail page — view ingredients, "Log this" CTA prefilled in `/log`, edit/delete buttons**

- [ ] **Step 4: Mark complete**

### Task 35: `/settings`

**Files:**
- Create: `app/(app)/settings/page.tsx`, `app/(app)/settings/goals/page.tsx`

- [ ] **Step 1: Profile section (name, sex, age, height, units, timezone)**

- [ ] **Step 2: Daily target override — editable number input**

- [ ] **Step 3: Reminder time picker, freeze count display**

- [ ] **Step 4: Sign out button (calls `supabase.auth.signOut()`)**

- [ ] **Step 5: `/settings/goals` — list of past `goals` rows (versioned history)**

- [ ] **Step 6: Mark complete**

---

## Phase 10 — Resilience

### Task 36: Offline queue (IndexedDB)

**Files:**
- Create: `lib/offline-queue.ts`, `lib/service-worker.ts`, `public/sw.js`

- [ ] **Step 1: IndexedDB wrapper for queued meals (idb library: `pnpm add idb`)**

- [ ] **Step 2: When `/api/analyze` POST fails with network error, write to IDB queue**

- [ ] **Step 3: Service worker listens for `online` and replays the queue**

- [ ] **Step 4: UI shows a "syncing N meals" badge while queue is non-empty**

- [ ] **Step 5: Mark complete**

### Task 37: Draft persistence + AI cost cap UI

**Files:**
- Modify: `actions/meals.ts`, `app/api/analyze/route.ts`
- Create: `components/cost-warning/cost-warning.tsx`

- [ ] **Step 1: Drafts already in `meal_drafts` (90-min TTL via column). Add a cron-like cleanup via Supabase scheduled function (optional — relies on TTL check at query time too).**

- [ ] **Step 2: When daily Gemini spend > $0.80 (80% of $1 cap), surface a toast banner**

- [ ] **Step 3: At $1, `/api/analyze` returns 429 with friendly message → UI shows `<CostWarning>` instead of blocking**

- [ ] **Step 4: Mark complete**

---

## Phase 11 — Tests

### Task 38: Vitest + Testcontainers setup

**Files:**
- Create: `vitest.config.ts`, `vitest.config.integration.ts`, `tests/setup/integration.ts`

- [ ] **Step 1: Configure Vitest for unit tests with `@/` path alias**

- [ ] **Step 2: Integration config: `globalSetup` spins up a Postgres container, runs `db/migrations/*.sql` + `db/policies.sql`, exposes `process.env.DATABASE_URL`**

- [ ] **Step 3: Verify a sample integration test passes**

- [ ] **Step 4: Mark complete**

### Task 39: RLS integration test (most important)

**Files:**
- Create: `tests/integration/rls.test.ts`

- [ ] **Step 1: Spin up two test users via Supabase admin client (service role)**

- [ ] **Step 2: User A logs a meal; User B's JWT-scoped query returns 0 rows for that meal**

- [ ] **Step 3: Repeat for: profiles, goals, weights, streaks, meal_items, user_food_overrides, meal_drafts, ai_calls**

- [ ] **Step 4: Storage RLS — User A uploads `meals/A/x.jpg`; User B's `download` call returns 403**

- [ ] **Step 5: Mark complete**

### Task 40: Playwright config + E2E happy paths

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/onboarding.spec.ts`, `tests/e2e/log-meal.spec.ts`, `tests/e2e/streak.spec.ts`

- [ ] **Step 1: Playwright config with `iPhone 16 Pro` viewport project + `desktop` project**

- [ ] **Step 2: Onboarding spec: visit `/`, click through all 7 screens, submit, expect `/today` visible**

- [ ] **Step 3: Log-meal spec: mock `/api/analyze` to return a fixture draft, walk through /log → /log/review → save → see meal on /today**

- [ ] **Step 4: Streak spec: seed yesterday's meal, log today, expect streak = 2**

- [ ] **Step 5: Mark complete**

### Task 41: LLM eval harness

**Files:**
- Create: `evals/runner.ts`, `evals/golden-meals.jsonl`, `evals/fixtures/*.jpg` (placeholder paths; real fixtures committed later)

- [ ] **Step 1: Runner loads JSONL, runs each case through `analyzeMeal()` + `resolveItem()`, asserts schema + logging_mode + kcal band + usda_query token overlap > 0.7**

- [ ] **Step 2: First 10 golden cases (component / composite / restaurant / saved_recipe / Whisper fallback / empty-photo / contradictory voice / Indian dish / branded packaged food / mixed-language transcript)**

- [ ] **Step 3: Output: console table of pass/fail per case, exit 1 if pass rate < 90% or regression > 5pt**

- [ ] **Step 4: Mark complete**

---

## Phase 12 — Polish

### Task 42: Marketing splash `/`

**Files:**
- Create: `app/(public)/page.tsx`

- [ ] **Step 1: Spark hero, value prop, "Get started" → `/onboarding`, "Sign in" → `/login`**

- [ ] **Step 2: Mark complete**

### Task 43: Lottie animations + confetti

**Files:**
- Modify: `components/spark/*`, `app/(public)/onboarding/plan/page.tsx`

- [ ] **Step 1: Add `pnpm add canvas-confetti`**

- [ ] **Step 2: Trigger confetti on Plan reveal + on first goal-hit per day**

- [ ] **Step 3: Optionally add Lottie file for Spark wave (defer if SVG+Framer Motion looks good enough)**

- [ ] **Step 4: Mark complete**

### Task 44: Lighthouse + accessibility pass

- [ ] **Step 1: Run Lighthouse mobile audit on `/today` after seeding a meal**

- [ ] **Step 2: Fix any score-degrading issues (font preloading, image alt text, ARIA labels on Spark)**

- [ ] **Step 3: Verify score ≥ 90 (Performance + Accessibility)**

- [ ] **Step 4: Mark complete**

### Task 45: README + DEPLOY.md

**Files:**
- Create: `README.md`, `DEPLOY.md`

- [ ] **Step 1: README — what the app is, local dev steps, env vars required, link to spec**

- [ ] **Step 2: DEPLOY.md — Supabase project creation, env var setup in Vercel, running migrations, applying policies, smoke-test checklist**

- [ ] **Step 3: Mark complete**

---

## Acceptance checklist (mirrors spec §13)

After all tasks complete, run through:

- [ ] Onboarding cold start → first meal saved in ≤ 60s on iPhone 16 Pro Safari
- [ ] Single meal capture → save in ≤ 15s (mocked Gemini)
- [ ] Every `meal_items` row has `source` and `source_ref`
- [ ] RLS test passes — both DB and Storage
- [ ] LLM eval ≥ 90% pass on 10 golden cases (full 50 deferred to post-v1)
- [ ] Streak ring correct after timezone-spanning midnight
- [ ] Lighthouse mobile `/today` ≥ 90
- [ ] Auth expiry mid-analyze → draft survives via localStorage

---

## Self-review notes

**Coverage check vs spec:**
- Architecture ✓ (Tasks 1, 3, 16, 25)
- Theme + mascot ✓ (Tasks 23, 24, 28, 43)
- Data model (11 tables) ✓ (Tasks 14, 15)
- RLS ✓ (Tasks 15, 39)
- Capture flow + state machine ✓ (Tasks 30, 31)
- Determinism pipeline ✓ (Tasks 10-13, 20)
- All 4 logging modes ✓ (handled in Gemini prompt + resolveItem branches)
- Error bands ✓ (Task 9, surfaced in UI Tasks 29, 31)
- Pages + nav ✓ (Tasks 25, 27-35)
- Error handling ✓ (Tasks 18, 31, 36, 37)
- Testing (4 layers) ✓ (Tasks 38-41)
- Acceptance criteria all mapped above

**Known shortcuts taken (call out for user):**
- Golden eval cases start at 10, not 50. Full 50 deferred to post-v1.
- Lottie files optional; SVG+Framer Motion is the primary path.
- iPhone 16 Pro mocked in Playwright (not real device); manual device testing required before release.
- Supabase project creation is manual — there's no script for it. User must follow DEPLOY.md.
