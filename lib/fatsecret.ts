/**
 * FatSecret Platform API client (OAuth 2.0).
 *
 * Auth: client_credentials grant → bearer token (cached ~24h).
 * Endpoint: https://platform.fatsecret.com/rest/foods/search/v5
 *
 * Why FatSecret in the pipeline:
 *  - Massive curated food database (millions of generic + branded foods)
 *  - Per-serving nutrition with metric (grams) breakdown
 *  - Reliable for cooked/raw distinctions where USDA struggled
 *
 * Free Basic scope covers: foods.search.v5, food.get.v4. Premier scope adds
 * natural-language-processing — we'll opportunistically use it when available.
 */

/**
 * Optional proxy host. When set, all FatSecret traffic is routed through this
 * URL — used to bypass FatSecret's per-IP allowlist when calling from Vercel
 * (whose serverless functions rotate across hundreds of IPs). The proxy is a
 * single static-IP server we control; FatSecret only sees its IP.
 *
 * Set to e.g. https://fs.kandel-bibas.com.np
 */
const PROXY_BASE = process.env.FATSECRET_PROXY?.replace(/\/+$/, "");
const TOKEN_URL = PROXY_BASE
  ? `${PROXY_BASE}/connect/token`
  : "https://oauth.fatsecret.com/connect/token";
const BASE_URL = PROXY_BASE
  ? `${PROXY_BASE}/rest`
  : "https://platform.fatsecret.com/rest";

interface TokenCache {
  value: string;
  expiresAt: number;
}
let _tokenCache: TokenCache | null = null;

interface OAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

async function getAccessToken(): Promise<string | null> {
  const id = process.env.FATSECRET_CLIENT_ID;
  const secret = process.env.FATSECRET_CLIENT_SECRET;
  if (!id || !secret) return null;

  // Reuse the cached token until ~1 min before expiry.
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 60_000) {
    return _tokenCache.value;
  }

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: "grant_type=client_credentials&scope=basic",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as OAuthResponse;
  if (!data.access_token) return null;

  _tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

// ---------- Food search ----------

interface FatSecretServing {
  serving_id: string;
  serving_description: string;
  serving_url?: string;
  metric_serving_amount?: string;
  metric_serving_unit?: string;
  calories?: string;
  protein?: string;
  carbohydrate?: string;
  fat?: string;
}

interface FatSecretFoodSearchHit {
  food_id: string;
  food_name: string;
  brand_name?: string;
  food_type?: string;
  food_description?: string;
}

interface FatSecretFoodDetail {
  food_id: string;
  food_name: string;
  food_type?: string;
  servings?: { serving: FatSecretServing | FatSecretServing[] };
}

export interface FatSecretResolved {
  food_id: string;
  food_name: string;
  food_type?: string;
  /** Per 100g nutrition, derived from the best gram-based serving. */
  kcal_per_100g: number;
  protein_per_100g: number;
  carb_per_100g: number;
  fat_per_100g: number;
}

/**
 * Search FatSecret food DB for a query string and return the top match's
 * per-100g nutrition. Returns null on auth failure, network error, or when
 * no usable serving with a gram-based metric is found.
 */
export async function searchFatSecret(
  query: string,
  preparation?: string,
): Promise<FatSecretResolved | null> {
  const token = await getAccessToken();
  if (!token) return null;

  // 1) Search for candidates. Use the basic-scope method-style endpoint —
  // foods.search.v5 requires the 'premier' scope which our free credentials
  // don't include.
  const searchUrl = new URL(`${BASE_URL}/server.api`);
  searchUrl.searchParams.set("method", "foods.search");
  searchUrl.searchParams.set("search_expression", query);
  searchUrl.searchParams.set("max_results", "10");
  searchUrl.searchParams.set("format", "json");

  let searchRes: Response;
  try {
    searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return null;
  }
  if (!searchRes.ok) return null;

  const searchData = (await searchRes.json()) as {
    foods?: { food?: FatSecretFoodSearchHit | FatSecretFoodSearchHit[] };
  };
  const rawFoods = searchData.foods?.food;
  const candidates: FatSecretFoodSearchHit[] = Array.isArray(rawFoods)
    ? rawFoods
    : rawFoods
      ? [rawFoods]
      : [];
  if (!candidates.length) return null;

  // 2) Rank by name similarity + preparation hint.
  const winner = rankFatSecretCandidates(candidates, query, preparation);
  if (!winner) return null;

  // 3) Fetch full nutrition for the winner via the basic-scope method-style
  // endpoint. v4 requires premier; method=food.get is in basic.
  const detailUrl = new URL(`${BASE_URL}/server.api`);
  detailUrl.searchParams.set("method", "food.get");
  detailUrl.searchParams.set("food_id", winner.food_id);
  detailUrl.searchParams.set("format", "json");

  let detailRes: Response;
  try {
    detailRes = await fetch(detailUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return null;
  }
  if (!detailRes.ok) return null;

  const detailData = (await detailRes.json()) as { food?: FatSecretFoodDetail };
  const food = detailData.food;
  if (!food) return null;

  const per100 = extractPer100g(food);
  if (!per100) return null;

  return {
    food_id: food.food_id,
    food_name: food.food_name,
    food_type: food.food_type,
    ...per100,
  };
}

function rankFatSecretCandidates(
  candidates: FatSecretFoodSearchHit[],
  query: string,
  preparation?: string,
): FatSecretFoodSearchHit | null {
  const queryTokens = new Set(
    query.toLowerCase().split(/\W+/).filter(Boolean),
  );

  const scored = candidates.map((c) => {
    const desc = `${c.food_name} ${c.food_description ?? ""}`.toLowerCase();
    const descTokens = new Set(desc.split(/\W+/).filter(Boolean));
    let common = 0;
    for (const t of queryTokens) if (descTokens.has(t)) common++;
    let score = common / Math.max(queryTokens.size, descTokens.size, 1);

    if (preparation && preparation !== "unknown") {
      if (desc.includes(preparation)) score += 0.35;
      // Mismatches penalize: cooked query, raw match (or vice versa).
      const opposites: Record<string, string[]> = {
        cooked: ["raw", "uncooked", "dry"],
        boiled: ["raw", "fried"],
        fried: ["raw", "boiled", "steamed"],
        grilled: ["raw", "boiled"],
        baked: ["raw", "boiled"],
        steamed: ["raw", "fried"],
        raw: ["cooked", "boiled", "fried", "grilled", "baked"],
      };
      const bad = opposites[preparation] ?? [];
      if (bad.some((b) => desc.includes(b))) score -= 0.45;
    }
    // Generic > Branded for natural-language queries.
    if (c.food_type === "Generic") score += 0.05;
    return { ...c, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  const top = scored[0];
  if (!top || top._score <= 0) return null;
  return top;
}

function extractPer100g(food: FatSecretFoodDetail): {
  kcal_per_100g: number;
  protein_per_100g: number;
  carb_per_100g: number;
  fat_per_100g: number;
} | null {
  const rawServings = food.servings?.serving;
  const servings: FatSecretServing[] = Array.isArray(rawServings)
    ? rawServings
    : rawServings
      ? [rawServings]
      : [];
  if (!servings.length) return null;

  // Prefer a serving whose metric_serving_unit is "g" so we can scale to 100g.
  // Sort candidates: explicit gram servings first, then size proximity to 100g.
  const gramServings = servings.filter(
    (s) => s.metric_serving_unit === "g" && s.metric_serving_amount,
  );
  if (!gramServings.length) return null;

  // Pick the one whose metric amount is closest to 100g for the cleanest math.
  gramServings.sort((a, b) => {
    const da = Math.abs(Number(a.metric_serving_amount) - 100);
    const db = Math.abs(Number(b.metric_serving_amount) - 100);
    return da - db;
  });
  const chosen = gramServings[0]!;
  const grams = Number(chosen.metric_serving_amount);
  if (!Number.isFinite(grams) || grams <= 0) return null;

  const factor = 100 / grams;
  const kcal = Number(chosen.calories);
  const protein = Number(chosen.protein);
  const carb = Number(chosen.carbohydrate);
  const fat = Number(chosen.fat);
  if (!Number.isFinite(kcal)) return null;

  return {
    kcal_per_100g: round1(kcal * factor),
    protein_per_100g: round1(protein * factor),
    carb_per_100g: round1(carb * factor),
    fat_per_100g: round1(fat * factor),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
