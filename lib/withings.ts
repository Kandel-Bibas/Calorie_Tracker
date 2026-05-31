/**
 * Withings Public API client.
 *
 * OAuth 2.0 flow:
 *   1. Redirect user to AUTHORIZE_URL with our client_id + redirect + scope
 *   2. They consent → Withings calls our /api/withings/callback?code=...
 *   3. POST to TOKEN_URL with action=requesttoken → get access + refresh tokens
 *   4. Tokens stored in `integrations` table (per user)
 *
 * Data:
 *   - measure/getactivity         (daily steps/calories/distance/active min)
 *   - measure/getmeas             (weight + body composition)
 *
 * Note Withings deviates from vanilla OAuth 2.0: their token endpoint
 * requires `action=requesttoken` in the form body. Their data endpoints
 * also require `action=<name>` instead of REST-style paths.
 */
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { integrations } from "@/db/schema";

const AUTHORIZE_URL = "https://account.withings.com/oauth2_user/authorize2";
const TOKEN_URL = "https://wbsapi.withings.net/v2/oauth2";
const API_BASE = "https://wbsapi.withings.net";

// Scope: user.metrics covers weight + body composition.
//        user.activity covers steps + calories + distance.
const DEFAULT_SCOPE = "user.metrics,user.activity";

function getRedirectUri(): string {
  const explicit = process.env.WITHINGS_REDIRECT_URI;
  if (explicit) return explicit;
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://calorie-tracker-omega-dusky.vercel.app";
  return `${base}/api/withings/callback`;
}

/**
 * Build the URL we redirect the user to so they can grant our app access.
 */
export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env.WITHINGS_CLIENT_ID;
  if (!clientId) throw new Error("WITHINGS_CLIENT_ID missing");
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", DEFAULT_SCOPE);
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

interface WithingsTokenResponse {
  status: number;
  body?: {
    userid: string;
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };
  error?: string;
}

/**
 * Exchange the OAuth `code` returned by Withings for access + refresh tokens.
 * Saves the result to the `integrations` table (one row per user).
 */
export async function exchangeCodeAndStore(args: {
  userId: string;
  code: string;
}): Promise<{ userid: string; expires_at: Date }> {
  const clientId = process.env.WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Withings client creds missing");

  const body = new URLSearchParams({
    action: "requesttoken",
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code: args.code,
    redirect_uri: getRedirectUri(),
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Withings token exchange HTTP ${res.status}`);
  }
  const data = (await res.json()) as WithingsTokenResponse;
  if (data.status !== 0 || !data.body) {
    throw new Error(`Withings token exchange error: status=${data.status} ${data.error ?? ""}`);
  }

  const expires_at = new Date(Date.now() + data.body.expires_in * 1000);
  const db = getDb();
  await db
    .insert(integrations)
    .values({
      user_id: args.userId,
      provider: "withings",
      external_user_id: data.body.userid,
      access_token: data.body.access_token,
      refresh_token: data.body.refresh_token,
      expires_at,
      scope: data.body.scope,
    })
    .onConflictDoUpdate({
      target: [integrations.user_id, integrations.provider],
      set: {
        external_user_id: data.body.userid,
        access_token: data.body.access_token,
        refresh_token: data.body.refresh_token,
        expires_at,
        scope: data.body.scope,
      },
    });

  return { userid: data.body.userid, expires_at };
}

/**
 * Get a valid Withings access token for the given user, refreshing if needed.
 * Returns null if no integration exists or the refresh fails.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const db = getDb();
  const row = await db.query.integrations.findFirst({
    where: and(eq(integrations.user_id, userId), eq(integrations.provider, "withings")),
  });
  if (!row) return null;

  // Use cached token if still valid for > 60s.
  if (row.expires_at && row.expires_at.getTime() > Date.now() + 60_000) {
    return row.access_token;
  }

  // Refresh.
  if (!row.refresh_token) return null;
  const clientId = process.env.WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    action: "requesttoken",
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: row.refresh_token,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as WithingsTokenResponse;
  if (data.status !== 0 || !data.body) return null;

  const expires_at = new Date(Date.now() + data.body.expires_in * 1000);
  await db
    .update(integrations)
    .set({
      access_token: data.body.access_token,
      refresh_token: data.body.refresh_token,
      expires_at,
    })
    .where(eq(integrations.id, row.id));
  return data.body.access_token;
}

// ---------- Data fetchers ----------

export interface WithingsActivityDay {
  date: string;
  steps: number;
  active_kcal: number;
  total_kcal: number;
  distance_m: number;
  active_minutes: number;
  raw: unknown;
}

interface ActivityApiResp {
  status: number;
  body?: {
    activities?: Array<{
      date: string;
      steps?: number;
      calories?: number;
      totalcalories?: number;
      distance?: number;
      active?: number;
      [k: string]: unknown;
    }>;
  };
}

/**
 * Get daily activity totals (steps + calories + distance + active minutes)
 * for a date range. Withings returns one row per day with data.
 */
export async function getActivity(args: {
  accessToken: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
}): Promise<WithingsActivityDay[]> {
  const body = new URLSearchParams({
    action: "getactivity",
    startdateymd: args.startDate,
    enddateymd: args.endDate,
    data_fields: "steps,calories,totalcalories,distance,active",
  });
  const res = await fetch(`${API_BASE}/v2/measure`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as ActivityApiResp;
  if (data.status !== 0 || !data.body?.activities) return [];

  return data.body.activities.map((a) => ({
    date: a.date,
    // Withings returns calories/distance as floats; our integer columns
    // need rounding before insert. The `active` field is in SECONDS per
    // Withings docs, so divide by 60 to get minutes.
    steps: Math.round(Number(a.steps ?? 0)),
    active_kcal: Math.round(Number(a.calories ?? 0)),
    total_kcal: Math.round(Number(a.totalcalories ?? 0)),
    distance_m: Math.round(Number(a.distance ?? 0)),
    active_minutes: Math.round(Number(a.active ?? 0) / 60),
    raw: a,
  }));
}

// Withings workout category code → human label. Top ~30 common.
// Full list: https://developer.withings.com/developer-guide/v3/data-api/workout-categories
const WORKOUT_LABELS: Record<number, string> = {
  1: "Walk", 2: "Run", 3: "Hiking", 4: "Skating", 5: "BMX", 6: "Bicycling",
  7: "Swim", 8: "Surfing", 9: "Kitesurfing", 10: "Windsurfing",
  11: "Bodyboard", 12: "Tennis", 13: "Table tennis", 14: "Squash",
  15: "Badminton", 16: "Lift weights", 17: "Calisthenics", 18: "Elliptical",
  19: "Pilates", 20: "Basketball", 21: "Soccer", 22: "Football",
  23: "Rugby", 24: "Volleyball", 25: "Water polo", 26: "Horse riding",
  27: "Golf", 28: "Yoga", 29: "Dancing", 30: "Boxing", 31: "Fencing",
  32: "Wrestling", 33: "Martial arts", 34: "Skiing", 35: "Snowboarding",
  36: "Rowing", 37: "Zumba", 38: "Baseball", 39: "Handball",
  40: "Hockey", 41: "Ice hockey", 42: "Climbing", 43: "Ice skating",
  44: "Multi-sport", 45: "Indoor running", 46: "Indoor cycling",
  187: "HIIT", 188: "Strength training", 189: "Stretching",
  191: "Cross training", 192: "Mountain biking", 196: "Workout",
};

export interface WithingsWorkout {
  external_id: string;
  startdate: number; // unix seconds
  enddate: number;
  category: number;
  category_label: string;
  active_kcal: number;
  distance_m: number;
  duration_s: number;
  avg_hr?: number;
  max_hr?: number;
  raw: unknown;
}

interface WorkoutsApiResp {
  status: number;
  body?: {
    series?: Array<{
      id?: number;
      category: number;
      startdate: number;
      enddate: number;
      data?: {
        calories?: number;
        distance?: number;
        steps?: number;
        hr_average?: number;
        hr_max?: number;
        [k: string]: unknown;
      };
      modified?: number;
      [k: string]: unknown;
    }>;
  };
}

/**
 * Get all workouts (running, cycling, weights, etc.) within a date range.
 * One row per workout session, with category + calories burned + duration.
 */
export async function getWorkouts(args: {
  accessToken: string;
  startDate: string;
  endDate: string;
}): Promise<WithingsWorkout[]> {
  const body = new URLSearchParams({
    action: "getworkouts",
    startdateymd: args.startDate,
    enddateymd: args.endDate,
    data_fields: "calories,distance,steps,hr_average,hr_max",
  });
  const res = await fetch(`${API_BASE}/v2/measure`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as WorkoutsApiResp;
  if (data.status !== 0 || !data.body?.series) return [];

  return data.body.series.map((w) => ({
    external_id: String(w.id ?? `${w.startdate}-${w.category}`),
    startdate: w.startdate,
    enddate: w.enddate,
    category: w.category,
    category_label: WORKOUT_LABELS[w.category] ?? "Workout",
    active_kcal: Math.round(Number(w.data?.calories ?? 0)),
    distance_m: Math.round(Number(w.data?.distance ?? 0)),
    duration_s: Math.max(0, w.enddate - w.startdate),
    avg_hr: w.data?.hr_average != null ? Number(w.data.hr_average) : undefined,
    max_hr: w.data?.hr_max != null ? Number(w.data.hr_max) : undefined,
    raw: w,
  }));
}

export interface WithingsWeightReading {
  date: string; // YYYY-MM-DD
  weight_kg: number;
}

interface MeasApiResp {
  status: number;
  body?: {
    measuregrps?: Array<{
      date: number; // unix seconds
      measures?: Array<{
        value: number;
        unit: number;
        type: number;
      }>;
    }>;
  };
}

/**
 * Get weight readings (one per measurement event) within a date range.
 * Withings returns values like `value=7250, unit=-2` → 72.5 kg.
 */
export async function getWeights(args: {
  accessToken: string;
  startDate: string;
  endDate: string;
}): Promise<WithingsWeightReading[]> {
  const startTs = Math.floor(new Date(args.startDate + "T00:00:00Z").getTime() / 1000);
  const endTs = Math.floor(new Date(args.endDate + "T23:59:59Z").getTime() / 1000);
  const body = new URLSearchParams({
    action: "getmeas",
    meastype: "1", // weight in kg
    category: "1", // real measurements (not user objectives)
    startdate: String(startTs),
    enddate: String(endTs),
  });
  const res = await fetch(`${API_BASE}/measure`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as MeasApiResp;
  if (data.status !== 0 || !data.body?.measuregrps) return [];

  const readings: WithingsWeightReading[] = [];
  for (const grp of data.body.measuregrps) {
    const weightMeasure = grp.measures?.find((m) => m.type === 1);
    if (!weightMeasure) continue;
    const kg = weightMeasure.value * Math.pow(10, weightMeasure.unit);
    const date = new Date(grp.date * 1000).toISOString().slice(0, 10);
    readings.push({ date, weight_kg: Math.round(kg * 10) / 10 });
  }
  return readings;
}
