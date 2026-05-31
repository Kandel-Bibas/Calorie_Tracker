import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { goals } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function GoalsHistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const db = getDb();

  const rows = await db.query.goals.findMany({
    where: eq(goals.user_id, user.id),
    orderBy: (g, { desc }) => [desc(g.activated_at)],
  });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Link
          href="/settings"
          className="rounded-md p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)]"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Goal history</h1>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">No goals set yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((g) => {
            const active = g.superseded_at === null;
            return (
              <li
                key={g.id}
                className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold tabular-nums text-[var(--color-text-primary)]">
                    {g.daily_kcal} kcal
                  </span>
                  {active ? (
                    <span className="rounded-full bg-[var(--color-success-green)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                      Active
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  {g.intent ?? "track"}
                  {g.pace ? ` · ${g.pace}` : ""} · activated{" "}
                  {g.activated_at
                    ? new Date(g.activated_at).toLocaleDateString()
                    : "?"}
                  {g.superseded_at
                    ? ` → ${new Date(g.superseded_at).toLocaleDateString()}`
                    : ""}
                </p>
                {g.protein_g != null || g.carb_g != null || g.fat_g != null ? (
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    Macros: {g.protein_g ?? 0}P / {g.carb_g ?? 0}C / {g.fat_g ?? 0}F
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
