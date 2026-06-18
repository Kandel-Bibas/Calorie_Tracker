import Link from "next/link";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { weights, profiles, goals } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { WeightChart, type WeightPoint } from "@/components/weight-chart/weight-chart";
import { toUserDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function WeightPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const db = getDb();

  const profileRow = await db.query.profiles.findFirst({
    where: eq(profiles.id, user.id),
    columns: { units_weight: true, timezone: true },
  });
  const unit: "lb" | "kg" = (profileRow?.units_weight as "lb" | "kg") ?? "lb";
  const tz = profileRow?.timezone ?? "America/Los_Angeles";

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 400); // load ~1y+ so the "all" tab works
  const cutoffIso = toUserDate(cutoff, tz);

  const rows = await db
    .select({ recorded_on: weights.recorded_on, weight_kg: weights.weight_kg })
    .from(weights)
    .where(and(eq(weights.user_id, user.id), gte(weights.recorded_on, cutoffIso)))
    .orderBy(weights.recorded_on);

  const points: WeightPoint[] = rows.map((r) => ({
    date: r.recorded_on,
    weight:
      unit === "kg"
        ? Math.round(Number(r.weight_kg) * 10) / 10
        : Math.round(Number(r.weight_kg) * 2.20462 * 10) / 10,
  }));

  const latest = await db.query.weights.findFirst({
    where: eq(weights.user_id, user.id),
    orderBy: [desc(weights.recorded_on)],
  });

  const activeGoal = await db.query.goals.findFirst({
    where: and(eq(goals.user_id, user.id), isNull(goals.superseded_at)),
    orderBy: (g, { desc }) => [desc(g.activated_at)],
    columns: { target_weight_kg: true },
  });
  const toDisplay = (kg: number) =>
    unit === "kg" ? Math.round(kg * 10) / 10 : Math.round(kg * 2.20462 * 10) / 10;
  const goalWeight =
    activeGoal?.target_weight_kg != null
      ? toDisplay(Number(activeGoal.target_weight_kg))
      : null;
  const latestDisplay = latest ? toDisplay(Number(latest.weight_kg)) : null;
  const toGoal =
    latestDisplay != null && goalWeight != null
      ? Math.round((latestDisplay - goalWeight) * 10) / 10
      : null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col">
          <p className="text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">
            Weight
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
            {latest ? (
              <>
                {latestDisplay}{" "}
                <span className="text-lg font-medium text-[var(--color-text-secondary)]">
                  {unit}
                </span>
              </>
            ) : (
              <span className="text-base font-medium text-[var(--color-text-secondary)]">
                No weight logged
              </span>
            )}
          </h1>
          {latest ? (
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Last logged {latest.recorded_on}
            </p>
          ) : null}
          {toGoal != null ? (
            <p className="mt-0.5 text-xs font-medium text-[var(--color-accent-blue)]">
              {Math.abs(toGoal) < 0.1
                ? "At your goal weight 🎯"
                : `${Math.abs(toGoal)} ${unit} ${toGoal > 0 ? "to lose" : "to gain"} · goal ${goalWeight} ${unit}`}
            </p>
          ) : null}
        </div>
        <Link href="/weight/add">
          <Button size="sm">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </Link>
      </header>

      <WeightChart points={points} unit={unit} goalWeight={goalWeight} />
    </div>
  );
}
