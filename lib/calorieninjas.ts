/**
 * API Ninjas (formerly CalorieNinjas) client — natural-language nutrition lookup.
 *
 * API:  GET https://api.api-ninjas.com/v1/nutrition?query=...
 *       headers: { 'X-Api-Key': '...' }
 *
 * IMPORTANT: The FREE tier returns "Only available for premium subscribers."
 * for `calories` and `protein_g` — i.e. the two fields we most need. We detect
 * this and return null so the resolver falls through to USDA. Upgrade to
 * premium on api-ninjas.com to unlock the calorie path.
 */

export interface CalorieNinjasItem {
  /** Free-text name as returned by the service. */
  name: string;
  /** Total kcal for the portion the user described. */
  calories: number;
  /** Total grams of fat. */
  fat_total_g: number;
  fat_saturated_g: number;
  protein_g: number;
  /** Carbs from the total (the API returns carbohydrates_total_g). */
  carb_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  potassium_mg: number;
  cholesterol_mg: number;
  /** Serving size in grams (the parsed portion). */
  serving_size_g: number;
}

interface RawNinjasItem {
  name: string;
  // API Ninjas returns either a number OR the literal string
  // "Only available for premium subscribers." on the free tier.
  calories: number | string;
  serving_size_g: number;
  fat_total_g: number;
  fat_saturated_g: number;
  protein_g: number | string;
  sodium_mg: number;
  potassium_mg: number;
  cholesterol_mg: number;
  carbohydrates_total_g: number;
  fiber_g: number;
  sugar_g: number;
}

function isPremiumGated(v: unknown): boolean {
  return typeof v === "string" && /premium/i.test(v);
}

/**
 * Look up nutrition for a natural-language string. Returns the FIRST item the
 * API parsed, or null on miss / no API key.
 *
 * @param query e.g. "200g cooked white rice", "1 slice cheese pizza"
 */
export async function lookupCalorieNinjas(query: string): Promise<CalorieNinjasItem | null> {
  const key = process.env.CALORIE_NINJAS_API_KEY;
  if (!key) return null;
  if (!query.trim()) return null;

  const url = new URL("https://api.api-ninjas.com/v1/nutrition");
  url.searchParams.set("query", query);

  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { "X-Api-Key": key } });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  // The free endpoint returns an array directly; the older client wrapped it
  // in `{ items: [...] }`. Handle both shapes.
  const raw = (await res.json()) as RawNinjasItem[] | { items?: RawNinjasItem[] };
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  const first = list[0];
  if (!first) return null;

  // Free-tier paywall: if calories or protein come back as the "premium" string,
  // we can't compute usable nutrition. Fall through to USDA.
  if (isPremiumGated(first.calories) || isPremiumGated(first.protein_g)) {
    return null;
  }
  const calories = typeof first.calories === "number" ? first.calories : Number(first.calories);
  const protein_g = typeof first.protein_g === "number" ? first.protein_g : Number(first.protein_g);
  if (!Number.isFinite(calories) || !Number.isFinite(first.serving_size_g) || first.serving_size_g <= 0) {
    return null;
  }

  return {
    name: first.name,
    calories,
    serving_size_g: first.serving_size_g,
    fat_total_g: first.fat_total_g,
    fat_saturated_g: first.fat_saturated_g,
    protein_g,
    carb_g: first.carbohydrates_total_g,
    fiber_g: first.fiber_g,
    sugar_g: first.sugar_g,
    sodium_mg: first.sodium_mg,
    potassium_mg: first.potassium_mg,
    cholesterol_mg: first.cholesterol_mg,
  };
}

/**
 * Convert a CalorieNinjas item (which gives TOTAL nutrition for the parsed
 * portion) to per-100g values so the rest of our pipeline can scale uniformly.
 */
export function ninjasToPer100g(item: CalorieNinjasItem): {
  kcal_per_100g: number;
  protein_per_100g: number;
  carb_per_100g: number;
  fat_per_100g: number;
} {
  const factor = 100 / item.serving_size_g;
  return {
    kcal_per_100g: round1(item.calories * factor),
    protein_per_100g: round1(item.protein_g * factor),
    carb_per_100g: round1(item.carb_g * factor),
    fat_per_100g: round1(item.fat_total_g * factor),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
