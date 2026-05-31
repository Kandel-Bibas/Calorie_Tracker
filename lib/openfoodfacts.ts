/**
 * Open Food Facts client — Tier 3 fallback when USDA misses (rare for
 * common foods; common for ethnic / regional / less-mainstream packaged goods).
 *
 * Free, no API key required.
 */

export interface OffResult {
  code: string;
  product_name: string;
  kcal_per_100g: number;
  protein_per_100g: number;
  carb_per_100g: number;
  fat_per_100g: number;
}

const OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";

interface OffProductRaw {
  code?: string;
  product_name?: string;
  nutriments?: Record<string, unknown>;
}

interface OffSearchResponse {
  products?: OffProductRaw[];
}

/**
 * Direct barcode lookup against Open Food Facts. Faster + more deterministic
 * than a name search when the user has a packaged product in hand.
 */
export async function lookupByBarcode(code: string): Promise<OffResult | null> {
  const clean = code.replace(/\D/g, "");
  if (!clean) return null;
  const url = `https://world.openfoodfacts.org/api/v2/product/${clean}.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "CalorieTracker/0.1 (kandel.bibas@example)" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { status?: number; product?: OffProductRaw };
  // status: 1 = found, 0 = not found
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  const n = p.nutriments ?? {};
  const kcal = numOrUndef(n["energy-kcal_100g"]);
  if (kcal == null) return null;
  return {
    code: p.code ?? clean,
    product_name: p.product_name ?? `Item ${clean}`,
    kcal_per_100g: kcal,
    protein_per_100g: numOrUndef(n["proteins_100g"]) ?? 0,
    carb_per_100g: numOrUndef(n["carbohydrates_100g"]) ?? 0,
    fat_per_100g: numOrUndef(n["fat_100g"]) ?? 0,
  };
}

export async function searchOpenFoodFacts(
  query: string,
): Promise<OffResult | null> {
  const url = new URL(OFF_SEARCH);
  url.searchParams.set("search_terms", query);
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "5");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "CalorieTracker/0.1 (kandel.bibas@example)" },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as OffSearchResponse;
  const p = data.products?.[0];
  if (!p) return null;

  const n = p.nutriments ?? {};
  const kcal = numOrUndef(n["energy-kcal_100g"]);
  if (kcal == null) return null;

  return {
    code: p.code ?? "",
    product_name: p.product_name ?? query,
    kcal_per_100g: kcal,
    protein_per_100g: numOrUndef(n["proteins_100g"]) ?? 0,
    carb_per_100g: numOrUndef(n["carbohydrates_100g"]) ?? 0,
    fat_per_100g: numOrUndef(n["fat_100g"]) ?? 0,
  };
}

function numOrUndef(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
