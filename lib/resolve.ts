/**
 * Item resolver.
 *
 * Resolution pipeline (top to bottom):
 *   1. user_food_overrides  — user's saved recipes and label-pastes
 *   2. food_cache           — global cache of prior resolutions
 *   3. CalorieNinjas        — natural-language nutrition (premium-only on free tier; we no-op silently)
 *   4. Gemini's inline per-100g — provided in the FoodItem when the analyze call ran
 *   5. Open Food Facts      — community/branded data
 *
 * USDA FoodData Central has been retired from this pipeline. Its matching
 * was too lossy in practice — cooked items mapped to raw entries, pan-fried
 * matched plain "potatoes, NS", etc. Gemini's per-100g estimates (which now
 * include cooking method explicitly) outperform USDA on the messy real-world
 * inputs this app sees.
 */
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { foodCache, userFoodOverrides } from "@/db/schema";
import { normalize } from "@/lib/normalize";
import { scale } from "@/lib/usda";
import { searchOpenFoodFacts } from "@/lib/openfoodfacts";
import { lookupCalorieNinjas, ninjasToPer100g } from "@/lib/calorieninjas";
import { searchFatSecret } from "@/lib/fatsecret";
import type { NutritionSource } from "@/lib/error-bands";
import type { LoggingMode } from "@/schemas/meal-analysis";

export interface ResolveInput {
  userId: string;
  usda_query: string;
  display_name: string;
  grams: number;
  preparation?: string;
  logging_mode: LoggingMode;
  /** Gemini-provided per-100g nutrition (now the default deep-fallback). */
  kcal_per_100g?: number;
  protein_per_100g?: number;
  carb_per_100g?: number;
  fat_per_100g?: number;
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
  const db = getDb();
  const qn = normalize(inp.usda_query);

  // Tier 1: per-user override (exact saved recipe / label / barcode).
  const ovr = await db.query.userFoodOverrides.findFirst({
    where: and(
      eq(userFoodOverrides.user_id, inp.userId),
      eq(userFoodOverrides.query_normalized, qn),
    ),
  });
  if (ovr) {
    const s = scale(toPer100g(ovr), inp.grams);
    return finalize("user_override", ovr.id, s, 1, false);
  }

  // Tier 2: global cache of prior resolutions.
  const cached = await db.query.foodCache.findFirst({
    where: eq(foodCache.query_normalized, qn),
  });
  if (cached) {
    const s = scale(toPer100g(cached), inp.grams);
    return finalize(cached.source as NutritionSource, cached.source_ref, s, 0.95, false);
  }

  // Tier 3: FatSecret platform — OAuth 2.0 search over curated food DB.
  // Per-100g extracted from the closest gram-based serving.
  const fs = await searchFatSecret(inp.usda_query, inp.preparation);
  if (fs) {
    const s = scale(
      { kcal: fs.kcal_per_100g, protein: fs.protein_per_100g, carb: fs.carb_per_100g, fat: fs.fat_per_100g },
      inp.grams,
    );
    await db
      .insert(foodCache)
      .values({
        query_normalized: qn,
        source: "fatsecret",
        source_ref: fs.food_id,
        kcal_per_100g: String(fs.kcal_per_100g),
        protein_per_100g: String(fs.protein_per_100g),
        carb_per_100g: String(fs.carb_per_100g),
        fat_per_100g: String(fs.fat_per_100g),
      })
      .onConflictDoNothing();
    return finalize("fatsecret", fs.food_id, s, 0.85, false);
  }

  // Tier 4: CalorieNinjas natural-language lookup. No-ops on free tier.
  const ninjasQuery = buildNinjasQuery(inp);
  const ninjas = await lookupCalorieNinjas(ninjasQuery);
  if (ninjas) {
    const per100 = ninjasToPer100g(ninjas);
    const s = scale(
      { kcal: per100.kcal_per_100g, protein: per100.protein_per_100g, carb: per100.carb_per_100g, fat: per100.fat_per_100g },
      inp.grams,
    );
    await db
      .insert(foodCache)
      .values({
        query_normalized: qn,
        source: "calorie_ninjas",
        source_ref: ninjas.name,
        kcal_per_100g: String(per100.kcal_per_100g),
        protein_per_100g: String(per100.protein_per_100g),
        carb_per_100g: String(per100.carb_per_100g),
        fat_per_100g: String(per100.fat_per_100g),
      })
      .onConflictDoNothing();
    return finalize("calorie_ninjas", ninjas.name, s, 0.9, false);
  }

  // Tier 4: Gemini's inline per-100g. Cooking method is encoded by Gemini.
  if (
    typeof inp.kcal_per_100g === "number" &&
    inp.kcal_per_100g > 0 &&
    typeof inp.protein_per_100g === "number" &&
    typeof inp.carb_per_100g === "number" &&
    typeof inp.fat_per_100g === "number"
  ) {
    const per100 = {
      kcal: inp.kcal_per_100g,
      protein: inp.protein_per_100g,
      carb: inp.carb_per_100g,
      fat: inp.fat_per_100g,
    };
    const s = scale(per100, inp.grams);
    await db
      .insert(foodCache)
      .values({
        query_normalized: qn,
        source: "gemini_estimate",
        source_ref: inp.display_name,
        kcal_per_100g: String(per100.kcal),
        protein_per_100g: String(per100.protein),
        carb_per_100g: String(per100.carb),
        fat_per_100g: String(per100.fat),
      })
      .onConflictDoNothing();
    return finalize("gemini_estimate", inp.display_name, s, 0.75, false);
  }

  // Tier 5: Open Food Facts (text search — best for packaged goods that
  // weren't scanned via barcode).
  const off = await searchOpenFoodFacts(inp.usda_query);
  if (off) {
    const s = scale(
      { kcal: off.kcal_per_100g, protein: off.protein_per_100g, carb: off.carb_per_100g, fat: off.fat_per_100g },
      inp.grams,
    );
    await db
      .insert(foodCache)
      .values({
        query_normalized: qn,
        source: "open_food_facts",
        source_ref: off.code,
        kcal_per_100g: String(off.kcal_per_100g),
        protein_per_100g: String(off.protein_per_100g),
        carb_per_100g: String(off.carb_per_100g),
        fat_per_100g: String(off.fat_per_100g),
      })
      .onConflictDoNothing();
    return finalize("open_food_facts", off.code, s, 0.6, true);
  }

  return null;
}

function toPer100g(row: {
  kcal_per_100g: string | number;
  protein_per_100g: string | number | null;
  carb_per_100g: string | number | null;
  fat_per_100g: string | number | null;
}) {
  return {
    kcal: Number(row.kcal_per_100g),
    protein: Number(row.protein_per_100g ?? 0),
    carb: Number(row.carb_per_100g ?? 0),
    fat: Number(row.fat_per_100g ?? 0),
  };
}

function buildNinjasQuery(inp: ResolveInput): string {
  const parts: string[] = [`${inp.grams}g`];
  if (inp.preparation && inp.preparation !== "unknown") {
    parts.push(inp.preparation);
  }
  const cleanQuery = inp.usda_query.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  parts.push(cleanQuery);
  return parts.join(" ");
}

function finalize(
  source: NutritionSource,
  source_ref: string,
  s: { kcal: number; protein: number; carb: number; fat: number },
  match_confidence: number,
  fell_back: boolean,
): ResolvedItem {
  return {
    source,
    source_ref,
    kcal: s.kcal,
    protein_g: s.protein,
    carb_g: s.carb,
    fat_g: s.fat,
    match_confidence,
    fell_back,
  };
}
