import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import Link from "next/link";
import { Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { goals, meals, mealItems, profiles, waterLogs } from "@/db/schema";
import { userToday, userDayRangeUtc } from "@/lib/dates";
import { getSignedPhotoUrl } from "@/lib/storage";
import { DailyRing } from "@/components/ring";
import { MacrosRow } from "@/components/macros-row";
import { Spark } from "@/components/spark";
import { Button } from "@/components/ui/button";
import { MealCard, type MealCardData, type MealCardItem } from "@/components/meal-card";
import { WaterCard } from "@/components/water-card/water-card";

export const dynamic = "force-dynamic";

const MEAL_ORDER: Record<string, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Layout already redirects, but guard for type narrowing.
    return null;
  }
  const userId = user.id;
  const db = getDb();

  const profileRow = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId),
    columns: { timezone: true, water_goal_ml: true, units_volume: true },
  });
  const tz = profileRow?.timezone ?? "America/Los_Angeles";
  const todayIso = userToday(tz);

  // Day window in UTC instants — close enough for v1; backend stores
  // tz-aware timestamps so this conservative window catches all meals
  // logged "today" in the user's local clock.
  // User-timezone-aware window so late-night meals (e.g. 11 PM local time
  // which is past midnight UTC) still count as today.
  const { start: dayStart, end: dayEnd } = userDayRangeUtc(tz, todayIso);

  const [goalRow, mealRows, waterRows] = await Promise.all([
    db.query.goals.findFirst({
      where: and(eq(goals.user_id, userId), isNull(goals.superseded_at)),
      orderBy: (g, { desc }) => [desc(g.activated_at)],
    }),
    db.query.meals.findMany({
      where: and(
        eq(meals.user_id, userId),
        gte(meals.consumed_at, dayStart),
        lt(meals.consumed_at, dayEnd),
      ),
      orderBy: [asc(meals.consumed_at)],
    }),
    db.query.waterLogs.findMany({
      where: and(
        eq(waterLogs.user_id, userId),
        gte(waterLogs.logged_at, dayStart),
        lt(waterLogs.logged_at, dayEnd),
      ),
      columns: { amount_ml: true },
    }),
  ]);

  const mealIds = mealRows.map((m) => m.id);
  const itemRows = mealIds.length
    ? await db.query.mealItems.findMany({
        where: (mi, { inArray }) => inArray(mi.meal_id, mealIds),
      })
    : [];
  const itemsByMeal = new Map<string, MealCardItem[]>();
  for (const r of itemRows) {
    const arr = itemsByMeal.get(r.meal_id) ?? [];
    arr.push({
      id: r.id,
      display_name: r.display_name,
      food_name: r.food_name,
      grams: Number(r.grams),
      kcal: Number(r.kcal),
      protein_g: r.protein_g != null ? Number(r.protein_g) : null,
      carb_g: r.carb_g != null ? Number(r.carb_g) : null,
      fat_g: r.fat_g != null ? Number(r.fat_g) : null,
      source: r.source,
      user_edited: r.user_edited ?? false,
    });
    itemsByMeal.set(r.meal_id, arr);
  }

  // Sign photo URLs in parallel.
  const photoUrls = await Promise.all(
    mealRows.map(async (m) => {
      if (!m.photo_path) return null;
      try {
        return await getSignedPhotoUrl(m.photo_path, 3600);
      } catch {
        return null;
      }
    }),
  );

  const cards: MealCardData[] = mealRows.map((m, i) => {
    const draft = (m.gemini_raw as { meal_label?: string } | null) ?? null;
    return {
      id: m.id,
      meal_type: (m.meal_type as MealCardData["meal_type"]) ?? null,
      consumed_at:
        m.consumed_at instanceof Date
          ? m.consumed_at.toISOString()
          : new Date(m.consumed_at as unknown as string).toISOString(),
      total_kcal: Number(m.total_kcal),
      error_band_low: m.error_band_low != null ? Number(m.error_band_low) : null,
      error_band_high: m.error_band_high != null ? Number(m.error_band_high) : null,
      photo_url: photoUrls[i] ?? null,
      label: draft?.meal_label ?? "Meal",
      items: itemsByMeal.get(m.id) ?? [],
    };
  });

  // Sort by meal type then time.
  cards.sort((a, b) => {
    const aOrder = a.meal_type ? MEAL_ORDER[a.meal_type] ?? 9 : 9;
    const bOrder = b.meal_type ? MEAL_ORDER[b.meal_type] ?? 9 : 9;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.consumed_at.localeCompare(b.consumed_at);
  });

  const totalKcal = cards.reduce((acc, c) => acc + c.total_kcal, 0);
  const bandLow = cards.reduce((a, c) => a + (c.error_band_low ?? c.total_kcal), 0);
  const bandHigh = cards.reduce((a, c) => a + (c.error_band_high ?? c.total_kcal), 0);
  const target = goalRow?.daily_kcal ?? 2000;

  // Hydration card inputs.
  const waterMl = waterRows.reduce((a, r) => a + (r.amount_ml ?? 0), 0);
  const waterGoalMl = profileRow?.water_goal_ml ?? 2000;
  const volumeUnit: "ml" | "oz" = profileRow?.units_volume === "oz" ? "oz" : "ml";

  // Aggregate per-macro totals from every item in every meal today.
  const totalProtein = itemRows.reduce(
    (a, r) => a + (r.protein_g != null ? Number(r.protein_g) : 0),
    0,
  );
  const totalCarb = itemRows.reduce(
    (a, r) => a + (r.carb_g != null ? Number(r.carb_g) : 0),
    0,
  );
  const totalFat = itemRows.reduce(
    (a, r) => a + (r.fat_g != null ? Number(r.fat_g) : 0),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col items-center gap-4 rounded-3xl bg-[var(--color-surface)] py-6 shadow-sm">
        <DailyRing
          consumed={totalKcal}
          target={target}
          errorBandLow={cards.length ? bandLow : undefined}
          errorBandHigh={cards.length ? bandHigh : undefined}
        />
        <div className="text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">
            {totalKcal >= target
              ? "Daily goal reached"
              : `${Math.max(0, Math.round(target - totalKcal))} kcal to go`}
          </p>
        </div>
        <MacrosRow
          protein_g={totalProtein}
          carb_g={totalCarb}
          fat_g={totalFat}
          protein_target={goalRow?.protein_g ?? null}
          carb_target={goalRow?.carb_g ?? null}
          fat_target={goalRow?.fat_g ?? null}
        />
      </section>

      <WaterCard initialMl={waterMl} goalMl={waterGoalMl} unit={volumeUnit} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Today's meals
          </h2>
          <Link href="/log">
            <Button size="sm" variant="ghost">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </Link>
        </div>

        {cards.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-surface-border)] bg-[var(--color-surface)] px-6 py-10 text-center">
            <Spark variant="wave" size={80} />
            <p className="text-base font-medium text-[var(--color-text-primary)]">
              Nothing logged yet
            </p>
            <p className="max-w-xs text-sm text-[var(--color-text-secondary)]">
              Snap a photo or say what you ate. Spark will figure out the rest.
            </p>
            <Link href="/log" className="mt-2">
              <Button>
                <Plus className="h-4 w-4" /> Log a meal
              </Button>
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {cards.map((c) => (
              <li key={c.id}>
                <MealCard meal={c} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
