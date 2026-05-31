import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { userFoodOverrides } from "@/db/schema";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const db = getDb();

  const rows = await db.query.userFoodOverrides.findMany({
    where: and(
      eq(userFoodOverrides.user_id, user.id),
      eq(userFoodOverrides.source, "recipe"),
    ),
    orderBy: (u, { desc }) => [desc(u.created_at)],
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">
            Recipes
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Saved recipes</h1>
        </div>
        <Link href="/recipes/new">
          <Button size="sm">
            <Plus className="h-4 w-4" /> New
          </Button>
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-surface-border)] bg-[var(--color-surface)] p-8 text-center">
          <p className="text-base font-medium text-[var(--color-text-primary)]">
            No recipes yet
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Save dishes you cook often so Spark can log them instantly next time.
          </p>
          <Link href="/recipes/new" className="mt-4 inline-block">
            <Button>Build your first recipe</Button>
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/recipes/${r.id}`}
                className="flex flex-col gap-1 rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-4 shadow-sm hover:shadow-md"
              >
                <span className="text-base font-semibold text-[var(--color-text-primary)]">
                  {r.display_name}
                </span>
                <span className="text-xs text-[var(--color-text-secondary)] tabular-nums">
                  {Math.round(Number(r.kcal_per_100g))} kcal / 100 g
                </span>
                <span className="text-xs text-[var(--color-text-tertiary)] tabular-nums">
                  Used {r.use_count ?? 0}× ·{" "}
                  {r.created_at
                    ? new Date(r.created_at).toLocaleDateString()
                    : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
