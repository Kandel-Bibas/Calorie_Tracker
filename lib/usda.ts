/**
 * USDA FoodData Central client.
 *
 * The pipeline is intentionally narrow:
 *  - search by query string against one or more datasets
 *  - rank candidates by name similarity + preparation match + dataset trust
 *  - extract per-100g energy + macros
 *
 * The LLM never invents kcal numbers. The numbers come from here.
 */

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";

export type UsdaDataType =
  | "Foundation"
  | "SR Legacy"
  | "Survey (FNDDS)"
  | "Branded";

export interface PerHundredG {
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
}

export interface UsdaResult extends PerHundredG {
  fdcId: number;
  description: string;
  dataType: UsdaDataType;
  kcal_per_100g: number;
  protein_per_100g: number;
  carb_per_100g: number;
  fat_per_100g: number;
}

/** USDA nutrient IDs we care about. */
const NUTRIENT_IDS = {
  kcal: 1008,
  protein: 1003,
  carb: 1005,
  fat: 1004,
} as const;

/**
 * Scale a per-100g nutrient block to actual grams consumed.
 *
 * scale({kcal: 158, ...}, 220) → {kcal: 347.6, ...}
 */
export function scale(per100g: PerHundredG, grams: number): PerHundredG {
  return {
    kcal: round1((per100g.kcal * grams) / 100),
    protein: round1((per100g.protein * grams) / 100),
    carb: round1((per100g.carb * grams) / 100),
    fat: round1((per100g.fat * grams) / 100),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Extract per-100g energy + macros from a USDA food's nutrient list. */
export function extractNutrients(food: {
  foodNutrients?: Array<{
    nutrientId?: number;
    nutrient?: { id?: number };
    value?: number;
    amount?: number;
  }>;
}): PerHundredG {
  const out: PerHundredG = { kcal: 0, protein: 0, carb: 0, fat: 0 };
  for (const n of food.foodNutrients ?? []) {
    const id = n.nutrient?.id ?? n.nutrientId;
    const v = n.amount ?? n.value ?? 0;
    if (id === NUTRIENT_IDS.kcal) out.kcal = v;
    if (id === NUTRIENT_IDS.protein) out.protein = v;
    if (id === NUTRIENT_IDS.carb) out.carb = v;
    if (id === NUTRIENT_IDS.fat) out.fat = v;
  }
  return out;
}

/** Token-set Jaccard similarity. */
function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.max(ta.size, tb.size);
}

export interface RankCandidate {
  fdcId: number;
  description: string;
  dataType: string;
}

/**
 * Words that should match between the query and the description for an
 * item to be a "true" hit. If the query says one of these, the matched
 * row's description should contain it or a compatible synonym.
 */
const PREP_KEYWORDS = ["cooked", "boiled", "steamed", "raw", "dry", "fried", "pan-fried", "grilled", "baked", "roasted"];

/**
 * Compatibility tiers for cooking states. Within a tier, descriptions are
 * roughly interchangeable nutritionally. Across tiers, we heavily penalize.
 */
const PREP_TIERS: Record<string, string[]> = {
  cooked: ["cooked", "boiled", "steamed"],
  boiled: ["cooked", "boiled", "steamed"],
  steamed: ["cooked", "boiled", "steamed"],
  fried: ["fried", "pan-fried", "deep-fried", "sauteed"],
  "pan-fried": ["fried", "pan-fried", "deep-fried", "sauteed"],
  grilled: ["grilled", "broiled"],
  baked: ["baked", "roasted"],
  raw: ["raw", "dry", "uncooked"],
};

function describesPrep(description: string, preparation: string): "match" | "incompatible" | "neutral" {
  const desc = description.toLowerCase();
  const compatibles = PREP_TIERS[preparation] ?? [preparation];
  if (compatibles.some((p) => desc.includes(p))) return "match";
  // Look for an INCOMPATIBLE prep word in the description.
  const otherPrepWords = PREP_KEYWORDS.filter((p) => !compatibles.includes(p));
  if (otherPrepWords.some((p) => desc.includes(p))) return "incompatible";
  return "neutral";
}

/**
 * Rank candidates by similarity to the query, with strong bias against
 * mismatched preparation (raw vs cooked, fried vs boiled, etc.). Without
 * this, USDA's search often returns the DRY/RAW entry above the COOKED one
 * even when the query explicitly says "cooked".
 */
export function rankUsdaResults(
  results: RankCandidate[],
  query: string,
  preparation?: string,
): RankCandidate & { _score: number } {
  const scored = results.map((r) => {
    let score = tokenSetRatio(query, r.description);

    // Preparation alignment is more important than token overlap. A "cooked
    // rice" query landing on a "rice, raw" row gives 100x worse kcal numbers
    // than a sibling whose description matches the cooking state.
    if (preparation) {
      const verdict = describesPrep(r.description, preparation);
      if (verdict === "match") score += 0.4;
      if (verdict === "incompatible") score -= 0.6;
    }

    // Datatype trust.
    if (r.dataType === "Foundation" || r.dataType === "SR Legacy") score += 0.1;
    if (r.dataType === "Branded") score -= 0.1;

    return { ...r, _score: score };
  });
  scored.sort((a, b) => b._score - a._score);
  return scored[0]!;
}

/**
 * Search USDA FoodData Central and return the top per-100g resolution,
 * or null if nothing usable was found.
 */
export async function searchUsda(
  query: string,
  preparation?: string,
  dataTypes: UsdaDataType[] = [
    "Foundation",
    "SR Legacy",
    "Survey (FNDDS)",
  ],
): Promise<UsdaResult | null> {
  const url = new URL(`${USDA_BASE}/foods/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("dataType", dataTypes.join(","));
  url.searchParams.set("pageSize", "5");
  url.searchParams.set("api_key", process.env.USDA_API_KEY ?? "DEMO_KEY");

  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = (await res.json()) as {
    foods?: Array<RankCandidate & { foodNutrients?: unknown[] }>;
  };
  if (!data.foods?.length) return null;

  const winner = rankUsdaResults(data.foods, query, preparation);
  const food = data.foods.find((f) => f.fdcId === winner.fdcId);
  if (!food) return null;

  // Cast: the USDA shape is loose; extractNutrients handles both nutrient.id and nutrientId styles
  const n = extractNutrients(food as Parameters<typeof extractNutrients>[0]);
  if (n.kcal === 0) return null;

  // Sanity check: if the winner's preparation is clearly incompatible with
  // the query, refuse the match so the caller can fall through to the next
  // tier (Branded → OFF → manual). A bad match is worse than no match.
  if (preparation) {
    const verdict = describesPrep(winner.description, preparation);
    if (verdict === "incompatible") return null;
  }

  return {
    fdcId: winner.fdcId,
    description: winner.description,
    dataType: winner.dataType as UsdaDataType,
    ...n,
    kcal_per_100g: n.kcal,
    protein_per_100g: n.protein,
    carb_per_100g: n.carb,
    fat_per_100g: n.fat,
  };
}
