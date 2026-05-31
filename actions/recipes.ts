"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { userFoodOverrides } from "@/db/schema";
import { resolveItem } from "@/lib/resolve";
import { normalize } from "@/lib/normalize";
import { RecipeSchema, type Recipe } from "@/schemas/recipe";

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  return user.id;
}

/**
 * Save a recipe as a user food override:
 *   1. resolve each ingredient through the USDA/OFF/cache pipeline,
 *   2. compute the weighted per-100g composition for the whole recipe,
 *   3. upsert into `user_food_overrides` keyed on (user_id, normalized name).
 *
 * The recipe name then resolves as Tier-0 (`user_override`) on future logs.
 */
export async function saveRecipe(input: Recipe): Promise<{ recipeId: string }> {
  const parsed = RecipeSchema.parse(input);
  const userId = await requireUserId();
  const db = getDb();

  // Resolve every ingredient in parallel.
  const resolved = await Promise.all(
    parsed.ingredients.map((ing) =>
      resolveItem({
        userId,
        usda_query: ing.usda_query,
        display_name: ing.display_name,
        grams: ing.grams,
        logging_mode: "component",
      }),
    ),
  );

  // Build per-100g values by aggregating absolute nutrient amounts then
  // dividing by total grams × 100. Ingredients that don't resolve contribute
  // zero (Tier-4 fallback — the recipe is still saved but under-counts).
  let totalGrams = 0;
  let totalKcal = 0;
  let totalProtein = 0;
  let totalCarb = 0;
  let totalFat = 0;
  for (let i = 0; i < parsed.ingredients.length; i++) {
    const ing = parsed.ingredients[i]!;
    const r = resolved[i];
    totalGrams += ing.grams;
    if (r) {
      totalKcal += r.kcal;
      totalProtein += r.protein_g;
      totalCarb += r.carb_g;
      totalFat += r.fat_g;
    }
  }
  if (totalGrams <= 0) throw new Error("recipe has zero total grams");

  const per100 = {
    kcal: (totalKcal / totalGrams) * 100,
    protein: (totalProtein / totalGrams) * 100,
    carb: (totalCarb / totalGrams) * 100,
    fat: (totalFat / totalGrams) * 100,
  };

  const qn = normalize(parsed.display_name);

  const [row] = await db
    .insert(userFoodOverrides)
    .values({
      user_id: userId,
      query_normalized: qn,
      display_name: parsed.display_name,
      kcal_per_100g: String(round2(per100.kcal)),
      protein_per_100g: String(round2(per100.protein)),
      carb_per_100g: String(round2(per100.carb)),
      fat_per_100g: String(round2(per100.fat)),
      source: "recipe",
      source_ref: null,
      recipe_ingredients: parsed.ingredients,
    })
    .onConflictDoUpdate({
      target: [userFoodOverrides.user_id, userFoodOverrides.query_normalized],
      set: {
        display_name: parsed.display_name,
        kcal_per_100g: String(round2(per100.kcal)),
        protein_per_100g: String(round2(per100.protein)),
        carb_per_100g: String(round2(per100.carb)),
        fat_per_100g: String(round2(per100.fat)),
        source: "recipe",
        recipe_ingredients: parsed.ingredients,
      },
    })
    .returning({ id: userFoodOverrides.id });
  if (!row) throw new Error("save recipe failed");

  revalidatePath("/recipes");
  return { recipeId: row.id };
}

/**
 * Delete a recipe. RLS enforces ownership at the row level; we also scope
 * the WHERE clause to (user_id, id) as belt-and-braces.
 */
export async function deleteRecipe(id: string): Promise<void> {
  const userId = await requireUserId();
  const db = getDb();
  await db
    .delete(userFoodOverrides)
    .where(and(eq(userFoodOverrides.id, id), eq(userFoodOverrides.user_id, userId)));
  revalidatePath("/recipes");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
