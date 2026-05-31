import { and, desc, eq, gte, lt } from "drizzle-orm";
import Link from "next/link";
import { Activity as ActivityIcon, Flame, Footprints, Timer } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  dailyActivity,
  workouts,
  weights,
  integrations,
  profiles,
} from "@/db/schema";
import { userToday, userDayRangeUtc } from "@/lib/dates";
import { WeightChart } from "@/components/weight-chart/weight-chart";

/**
 * Fitness hub.
 *
 * Today's stats on top, then 7-day step + burn trend, recent workouts,
 * weight chart at the bottom. Replaces the standalone /weight tab.
 */
export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const userId = user.id;
  const db = getDb();

  const profileRow = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId),
    columns: { timezone: true, units_weight: true },
  });
  const tz = profileRow?.timezone ?? "America/Los_Angeles";
  const units = profileRow?.units_weight === "lb" ? "lb" : "kg";
  const todayIso = userToday(tz);
  const { start: dayStart, end: dayEnd } = userDayRangeUtc(tz, todayIso);

  // Date range covering the trend chart (90d for weight; 7d for activity).
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);

  const [
    todayActivity,
    todayWorkouts,
    integrationRow,
    activityWeek,
    workoutsRecent,
    weightRows,
  ] = await Promise.all([
    db.query.dailyActivity.findFirst({
      where: and(
        eq(dailyActivity.user_id, userId),
        eq(dailyActivity.date, todayIso),
        eq(dailyActivity.source, "withings"),
      ),
    }),
    db.query.workouts.findMany({
      where: and(
        eq(workouts.user_id, userId),
        gte(workouts.started_at, dayStart),
        lt(workouts.started_at, dayEnd),
      ),
      orderBy: [desc(workouts.started_at)],
    }),
    db.query.integrations.findFirst({
      where: and(eq(integrations.user_id, userId), eq(integrations.provider, "withings")),
    }),
    db.query.dailyActivity.findMany({
      where: and(
        eq(dailyActivity.user_id, userId),
        gte(dailyActivity.date, isoDaysAgo(7)),
      ),
      orderBy: [desc(dailyActivity.date)],
    }),
    db.query.workouts.findMany({
      where: eq(workouts.user_id, userId),
      orderBy: [desc(workouts.started_at)],
      limit: 20,
    }),
    db.query.weights.findMany({
      where: and(
        eq(weights.user_id, userId),
        gte(weights.recorded_on, ninetyDaysAgo.toISOString().slice(0, 10)),
      ),
      orderBy: (w, { asc }) => [asc(w.recorded_on)],
    }),
  ]);

  const todayBurned =
    todayWorkouts.reduce((a, w) => a + (w.active_kcal ?? 0), 0) ||
    (todayActivity?.active_kcal ?? 0);

  // 7-day totals
  const weekSteps = activityWeek.reduce((a, r) => a + (r.steps ?? 0), 0);
  const weekBurned = activityWeek.reduce((a, r) => a + (r.active_kcal ?? 0), 0);
  const weekActive = activityWeek.reduce((a, r) => a + (r.active_minutes ?? 0), 0);

  const weightPoints = weightRows.map((r) => {
    const kg = Number(r.weight_kg);
    return {
      date: typeof r.recorded_on === "string" ? r.recorded_on : (r.recorded_on as Date).toISOString().slice(0, 10),
      weight: units === "lb" ? Math.round(kg * 2.20462 * 10) / 10 : kg,
    };
  });

  const notConnected = !integrationRow;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
          Activity
        </h1>
        {notConnected ? (
          <Link
            href="/settings"
            className="text-xs font-medium text-[var(--color-accent-blue)]"
          >
            Connect Withings →
          </Link>
        ) : null}
      </header>

      {notConnected ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-surface-border)] bg-[var(--color-surface)] px-6 py-10 text-center">
          <ActivityIcon className="h-10 w-10 text-[var(--color-text-tertiary)]" />
          <p className="text-base font-medium text-[var(--color-text-primary)]">
            No fitness data yet
          </p>
          <p className="max-w-xs text-sm text-[var(--color-text-secondary)]">
            Connect Withings (or Apple Health via Withings) from Settings to see
            your steps, workouts, burned calories, and weight trends.
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-3 rounded-3xl bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Today
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            icon={<Footprints className="h-4 w-4" />}
            label="Steps"
            value={(todayActivity?.steps ?? 0).toLocaleString()}
          />
          <StatTile
            icon={<Flame className="h-4 w-4" />}
            label="Burned"
            value={`${Math.round(todayBurned)} kcal`}
          />
          <StatTile
            icon={<Timer className="h-4 w-4" />}
            label="Active"
            value={`${todayActivity?.active_minutes ?? 0} min`}
          />
          <StatTile
            icon={<ActivityIcon className="h-4 w-4" />}
            label="Workouts"
            value={String(todayWorkouts.length)}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Last 7 days
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <BigStat label="Steps" value={weekSteps.toLocaleString()} unit="" />
          <BigStat label="Burned" value={weekBurned.toLocaleString()} unit="kcal" />
          <BigStat label="Active" value={weekActive.toLocaleString()} unit="min" />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Recent workouts
        </h2>
        {workoutsRecent.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            No workouts recorded yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--color-surface-border)]">
            {workoutsRecent.map((w) => {
              const start =
                w.started_at instanceof Date
                  ? w.started_at
                  : new Date(w.started_at as unknown as string);
              return (
                <li key={w.id} className="flex items-center justify-between py-2.5">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                      {w.category_label ?? "Workout"}
                    </span>
                    <span className="text-xs text-[var(--color-text-secondary)] tabular-nums">
                      {start.toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {w.duration_s ? ` · ${Math.round(w.duration_s / 60)} min` : ""}
                      {w.distance_m ? ` · ${(w.distance_m / 1000).toFixed(2)} km` : ""}
                      {w.avg_hr ? ` · ${w.avg_hr} bpm avg` : ""}
                    </span>
                  </div>
                  {w.active_kcal && w.active_kcal > 0 ? (
                    <span className="text-sm font-semibold tabular-nums text-[var(--color-spark-orange)]">
                      −{w.active_kcal} kcal
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-3xl bg-[var(--color-surface)] p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Weight
          </h2>
          <Link
            href="/weight/add"
            className="text-xs font-medium text-[var(--color-accent-blue)]"
          >
            Add manually →
          </Link>
        </div>
        {weightPoints.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            No weight logged in the last 90 days.
          </p>
        ) : (
          <WeightChart points={weightPoints} unit={units} />
        )}
      </section>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-[var(--color-surface-muted)] p-3">
      <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-lg font-semibold tabular-nums text-[var(--color-text-primary)]">
        {value}
      </span>
    </div>
  );
}

function BigStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">
        {value}
      </span>
      {unit ? (
        <span className="text-[11px] text-[var(--color-text-tertiary)]">{unit}</span>
      ) : null}
      <span className="text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)]">
        {label}
      </span>
    </div>
  );
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
