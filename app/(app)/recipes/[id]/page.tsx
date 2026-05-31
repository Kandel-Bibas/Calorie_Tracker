import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { userFoodOverrides } from "@/db/schema";
import { RecipeBuilder } from "@/components/recipe-builder/recipe-builder";
import type { RecipeIngredient } from "@/schemas/recipe";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RecipeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const db = getDb();

  const row = await db.query.userFoodOverrides.findFirst({
    where: and(
      eq(userFoodOverrides.id, id),
      eq(userFoodOverrides.user_id, user.id),
    ),
  });
  if (!row) notFound();

  const ingredients = Array.isArray(row.recipe_ingredients)
    ? (row.recipe_ingredients as unknown as RecipeIngredient[])
    : [];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-2">
        <Link
          href="/recipes"
          className="rounded-md p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)]"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">
            Recipe
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{row.display_name}</h1>
        </div>
      </header>

      <div className="rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
        <p className="text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">
          Per 100 g
        </p>
        <p className="text-2xl font-semibold tabular-nums text-[var(--color-text-primary)]">
          {Math.round(Number(row.kcal_per_100g))} kcal
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] tabular-nums">
          {Math.round(Number(row.protein_per_100g ?? 0))}P /{" "}
          {Math.round(Number(row.carb_per_100g ?? 0))}C /{" "}
          {Math.round(Number(row.fat_per_100g ?? 0))}F
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Edit
        </h2>
        <RecipeBuilder
          initial={{
            display_name: row.display_name,
            ingredients,
          }}
        />
      </section>
    </div>
  );
}
