import Link from "next/link";
import { and, asc, eq, gte, lt } from "drizzle-orm";

import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { meals, profiles, goals } from "@/db/schema";
import { userToday } from "@/lib/dates";

export const dynamic = "force-dynamic";

interface DayCell {
  date: string;
  kcal: number;
  inMonth: boolean;
}

function getMonthGrid(year: number, monthIdx: number): DayCell[] {
  const first = new Date(year, monthIdx, 1);
  const last = new Date(year, monthIdx + 1, 0);
  const cells: DayCell[] = [];
  const leading = first.getDay(); // 0=Sun
  // Leading days from previous month
  for (let i = leading; i > 0; i--) {
    const d = new Date(year, monthIdx, 1 - i);
    cells.push({ date: d.toISOString().slice(0, 10), kcal: 0, inMonth: false });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    const dt = new Date(year, monthIdx, d);
    cells.push({ date: dt.toISOString().slice(0, 10), kcal: 0, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const next = new Date(year, monthIdx, last.getDate() + (cells.length % 7));
    cells.push({ date: next.toISOString().slice(0, 10), kcal: 0, inMonth: false });
  }
  return cells;
}

export default async function HistoryPage() {
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

  const todayIso = userToday(tz);
  const today = new Date(todayIso + "T00:00:00");
  const year = today.getFullYear();
  const monthIdx = today.getMonth();
  const cells = getMonthGrid(year, monthIdx);

  // Aggregate kcal per user-day for this month window.
  const monthStart = new Date(year, monthIdx - 1, 1);
  const monthEnd = new Date(year, monthIdx + 2, 1);
  const mealRows = await db
    .select({
      id: meals.id,
      consumed_at: meals.consumed_at,
      total_kcal: meals.total_kcal,
    })
    .from(meals)
    .where(
      and(
        eq(meals.user_id, user.id),
        gte(meals.consumed_at, monthStart),
        lt(meals.consumed_at, monthEnd),
      ),
    )
    .orderBy(asc(meals.consumed_at));

  const byDate = new Map<string, number>();
  for (const m of mealRows) {
    const d =
      m.consumed_at instanceof Date
        ? m.consumed_at
        : new Date(m.consumed_at as unknown as string);
    const iso = d.toISOString().slice(0, 10);
    byDate.set(iso, (byDate.get(iso) ?? 0) + Number(m.total_kcal));
  }
  for (const c of cells) {
    c.kcal = Math.round(byDate.get(c.date) ?? 0);
  }

  const activeGoal = await db.query.goals.findFirst({
    where: and(eq(goals.user_id, user.id)),
    orderBy: (g, { desc }) => [desc(g.activated_at)],
  });
  const target = activeGoal?.daily_kcal ?? 2000;
  const monthLabel = today.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">
          History
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{monthLabel}</h1>
      </header>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const ratio = target > 0 ? Math.min(1, c.kcal / target) : 0;
          const filled = c.kcal > 0;
          const color =
            ratio >= 0.95 && ratio <= 1.05
              ? "#34C759"
              : ratio > 1.05
                ? "#FF9500"
                : "#FF3B30";
          return (
            <Link
              key={c.date}
              href={`/history/${c.date}`}
              className={
                "flex aspect-square flex-col items-center justify-center rounded-xl border border-[var(--color-surface-border)] p-1 text-[10px] " +
                (c.inMonth
                  ? "bg-[var(--color-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-muted)]"
                  : "bg-transparent text-[var(--color-text-tertiary)]")
              }
            >
              <span className="text-xs font-medium">
                {Number(c.date.slice(-2))}
              </span>
              {filled ? (
                <span
                  className="mt-0.5 h-1.5 w-6 rounded-full"
                  style={{
                    background: `linear-gradient(to right, ${color} ${ratio * 100}%, var(--color-surface-muted) ${ratio * 100}%)`,
                  }}
                />
              ) : null}
              {filled ? (
                <span className="mt-0.5 text-[9px] tabular-nums text-[var(--color-text-tertiary)]">
                  {c.kcal}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
