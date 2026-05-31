import Link from "next/link";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { goals, meals, profiles } from "@/db/schema";
import { userDayRangeUtc } from "@/lib/dates";
import { getSignedPhotoUrl } from "@/lib/storage";
import { DailyRing } from "@/components/ring";
import { MealCard, type MealCardData, type MealCardItem } from "@/components/meal-card";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ date: string }>;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function HistoryDatePage({ params }: PageProps) {
  const { date } = await params;
  if (!ISO_RE.test(date)) {
    return (
      <p className="p-4 text-sm text-[var(--color-text-secondary)]">
        Invalid date.
      </p>
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const db = getDb();

  const profileRow = await db.query.profiles.findFirst({
    where: eq(profiles.id, user.id),
    columns: { timezone: true },
  });
  const tz = profileRow?.timezone ?? "America/Los_Angeles";
  const { start: dayStart, end: dayEnd } = userDayRangeUtc(tz, date);

  const [goalRow, mealRows] = await Promise.all([
    db.query.goals.findFirst({
      where: eq(goals.user_id, user.id),
      orderBy: (g, { desc }) => [desc(g.activated_at)],
    }),
    db.query.meals.findMany({
      where: and(
        eq(meals.user_id, user.id),
        gte(meals.consumed_at, dayStart),
        lt(meals.consumed_at, dayEnd),
      ),
      orderBy: [asc(meals.consumed_at)],
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

  const urls = await Promise.all(
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
      photo_url: urls[i] ?? null,
      label: draft?.meal_label ?? "Meal",
      items: itemsByMeal.get(m.id) ?? [],
    };
  });

  const totalKcal = cards.reduce((a, c) => a + c.total_kcal, 0);
  const target = goalRow?.daily_kcal ?? 2000;

  const label = new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-2">
        <Link
          href="/history"
          className="rounded-md p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)]"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">
            {label}
          </p>
          <h1 className="text-xl font-bold tracking-tight">{date}</h1>
        </div>
      </header>

      <section className="flex justify-center rounded-3xl bg-[var(--color-surface)] py-5 shadow-sm">
        <DailyRing
          consumed={totalKcal}
          target={target}
          size={200}
        />
      </section>

      {cards.length === 0 ? (
        <p className="text-center text-sm text-[var(--color-text-secondary)]">
          No meals logged this day.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards.map((c) => (
            <li key={c.id}>
              <MealCard meal={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
