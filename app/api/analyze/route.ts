import { randomUUID } from "node:crypto";
import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { aiCalls, foodCache, mealDrafts, profiles } from "@/db/schema";
import { uploadMealPhoto } from "@/lib/storage";
import { analyzeMeal } from "@/lib/gemini";
import { resolveItem, type ResolvedItem } from "@/lib/resolve";
import { mealBand } from "@/lib/error-bands";
import { userToday } from "@/lib/dates";
import { normalize } from "@/lib/normalize";
import type { FoodItem, MealAnalysis } from "@/schemas/meal-analysis";

interface ScannedItemInput {
  code: string;
  name: string;
  grams: number;
  kcal_per_100g: number;
  protein_per_100g: number;
  carb_per_100g: number;
  fat_per_100g: number;
}

export const runtime = "nodejs";
// Allow up to ~30s for the full pipeline (Gemini + USDA + storage). Vercel default is 10s on hobby.
export const maxDuration = 60;

// ---- Cost guard ----
// Gemini Flash pricing (per spec): $0.075/1M input tokens, $0.30/1M output tokens.
// Convert to per-token rates.
const INPUT_RATE_USD_PER_TOKEN = 0.000_000_075; // $0.075 / 1_000_000
const OUTPUT_RATE_USD_PER_TOKEN = 0.000_000_3; //  $0.30  / 1_000_000
const DAILY_USD_CAP = 1.0;

const GEMINI_TIMEOUT_MS = 30_000;
const SLOW_GEMINI_HINT_MS = 8_000;

interface DraftItem {
  usda_query: string;
  display_name: string;
  grams: number;
  user_provided_grams: boolean;
  logging_mode: FoodItem["logging_mode"];
  preparation: FoodItem["preparation"];
  composite_components?: string[];
  estimation_basis?: string;
  // Resolution outputs (null when nothing matched → UI Tier-4 fallback).
  source: string | null;
  source_ref: string | null;
  kcal: number | null;
  protein_g: number | null;
  carb_g: number | null;
  fat_g: number | null;
  match_confidence: number | null;
  fell_back: boolean;
}

interface DraftTotals {
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  error_band_low: number;
  error_band_high: number;
}

interface DraftData {
  meal_label: string;
  notes?: string;
  items: DraftItem[];
  totals: DraftTotals;
  photo_path: string | null;
  transcript: string | null;
}

/**
 * POST /api/analyze
 *
 * Multipart form:
 *   - photo:       File (optional)
 *   - audio:       File (optional)
 *   - transcript:  string (optional) — if present, skip Whisper
 *   - typed_text:  string (optional) — user-typed description
 *
 * Streams NDJSON chunks back:
 *   {"type":"status","message":"..."}
 *   {"type":"draft","draftId":"...","items":[...],"totals":{...},"photo_path":"..."}
 *   {"type":"error","message":"..."}
 *
 * Persists a `meal_drafts` row + `ai_calls` row. The draft is consumed by
 * the `saveMeal` Server Action.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = user.id;
  const db = getDb();

  // ---- Cost guard: today's spend (in user's timezone) ----
  const tz = await getUserTimezone(userId);
  const todayStartUtc = userDayStartUtc(tz);
  const tomorrowStartUtc = new Date(todayStartUtc.getTime() + 24 * 60 * 60 * 1000);
  const todaysCalls = await db
    .select({
      input_tokens: aiCalls.input_tokens,
      output_tokens: aiCalls.output_tokens,
    })
    .from(aiCalls)
    .where(
      and(
        eq(aiCalls.user_id, userId),
        gte(aiCalls.created_at, todayStartUtc),
        lt(aiCalls.created_at, tomorrowStartUtc),
      ),
    );

  const spentUsd = todaysCalls.reduce((acc, c) => {
    const i = c.input_tokens ?? 0;
    const o = c.output_tokens ?? 0;
    return acc + i * INPUT_RATE_USD_PER_TOKEN + o * OUTPUT_RATE_USD_PER_TOKEN;
  }, 0);
  if (spentUsd > DAILY_USD_CAP) {
    return Response.json(
      { error: "daily cost cap exceeded", spent_usd: spentUsd },
      { status: 429 },
    );
  }

  // ---- Parse multipart input ----
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    const m = err instanceof Error ? err.message : "bad form";
    return Response.json({ error: m }, { status: 400 });
  }

  const photo = form.get("photo");
  const audio = form.get("audio");
  const providedTranscript = (form.get("transcript") as string | null) ?? null;
  const typedText = (form.get("typed_text") as string | null) ?? null;
  const scannedItemsRaw = (form.get("scanned_items") as string | null) ?? null;

  let scannedItems: ScannedItemInput[] = [];
  if (scannedItemsRaw) {
    try {
      const parsed = JSON.parse(scannedItemsRaw) as unknown;
      if (Array.isArray(parsed)) {
        scannedItems = parsed.filter(
          (it): it is ScannedItemInput =>
            !!it && typeof it === "object" &&
            typeof (it as ScannedItemInput).code === "string" &&
            typeof (it as ScannedItemInput).name === "string" &&
            typeof (it as ScannedItemInput).grams === "number" &&
            typeof (it as ScannedItemInput).kcal_per_100g === "number",
        );
      }
    } catch {
      // ignore malformed scanned_items
    }
  }

  const hasGeminiInput =
    photo instanceof File || audio instanceof File || providedTranscript || typedText;
  if (!hasGeminiInput && scannedItems.length === 0) {
    return Response.json(
      { error: "need photo, audio, transcript, typed_text, or scanned_items" },
      { status: 400 },
    );
  }

  // ---- Build the streaming response ----
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        send({ type: "status", message: "Identifying foods..." });

        const draftId = randomUUID();

        // ---- 1. Upload photo if present ----
        let photoPath: string | null = null;
        let imageBytes: Uint8Array | undefined;
        let imageMime: string | undefined;
        if (photo instanceof File && photo.size > 0) {
          const buf = new Uint8Array(await photo.arrayBuffer());
          imageBytes = buf;
          imageMime = photo.type || "image/jpeg";
          try {
            photoPath = await uploadMealPhoto(userId, draftId, new Blob([new Uint8Array(buf)], { type: imageMime }));
          } catch (err) {
            // Storage upload is non-fatal — we can still analyze without persisting the photo.
            const m = err instanceof Error ? err.message : "upload failed";
            send({ type: "status", message: `Photo upload failed: ${m}. Continuing without photo.` });
            photoPath = null;
          }
        }

        // ---- 2. Transcribe audio if needed ----
        let transcript: string | null = providedTranscript;
        if (!transcript && audio instanceof File && audio.size > 0) {
          transcript = await transcribeAudio(req, audio);
        }

        // ---- 3. Gemini call (skipped when only scanned items present) ----
        let analysis: { parsed: MealAnalysis; input_tokens?: number; output_tokens?: number; latency_ms: number } | undefined;
        let geminiError: string | null = null;

        if (hasGeminiInput) {
          const ac = new AbortController();
          const abortTimer = setTimeout(() => ac.abort(), GEMINI_TIMEOUT_MS);
          const slowTimer = setTimeout(() => {
            send({ type: "status", message: "Slow request..." });
          }, SLOW_GEMINI_HINT_MS);

          try {
            analysis = await raceWithAbort(
              analyzeMeal({
                imageBytes,
                imageMime,
                transcript: transcript ?? undefined,
                typed_text: typedText ?? undefined,
              }),
              ac.signal,
            );
          } catch (err) {
            geminiError = err instanceof Error ? err.message : "gemini failed";
          } finally {
            clearTimeout(abortTimer);
            clearTimeout(slowTimer);
          }

          // Always log the AI call (success or failure).
          await db
            .insert(aiCalls)
            .values({
              user_id: userId,
              model: "gemini-3-flash-preview",
              call_kind: "analyze",
              input_tokens: analysis?.input_tokens ?? null,
              output_tokens: analysis?.output_tokens ?? null,
              latency_ms: analysis?.latency_ms ?? null,
              error: geminiError,
            })
            .catch(() => {
              // observability table failure should never break the user request
            });

          if (!analysis && scannedItems.length === 0) {
            send({ type: "error", message: geminiError ?? "analysis failed" });
            controller.close();
            return;
          }
        }

        send({ type: "status", message: "Looking up nutrition..." });

        // ---- 4. Resolve Gemini-identified items in parallel ----
        const geminiItems = analysis?.parsed.items ?? [];
        const resolved = await Promise.all(
          geminiItems.map((it) =>
            resolveItem({
              userId,
              usda_query: it.usda_query,
              display_name: it.display_name,
              grams: it.grams,
              preparation: it.preparation,
              logging_mode: it.logging_mode,
              // Pass Gemini's per-100g through — used as the resolver's deep
              // fallback now that USDA is retired from the pipeline.
              kcal_per_100g: it.kcal_per_100g,
              protein_per_100g: it.protein_per_100g,
              carb_per_100g: it.carb_per_100g,
              fat_per_100g: it.fat_per_100g,
            }).catch(() => null as ResolvedItem | null),
          ),
        );

        // ---- 5. Build draft items (Gemini items + scanned items) ----
        const items: DraftItem[] = geminiItems.map((it, idx) => {
          const r = resolved[idx];
          return {
            usda_query: it.usda_query,
            display_name: it.display_name,
            grams: it.grams,
            user_provided_grams: it.user_provided_grams,
            logging_mode: it.logging_mode,
            preparation: it.preparation,
            composite_components: it.composite_components,
            estimation_basis: it.estimation_basis,
            source: r?.source ?? null,
            source_ref: r?.source_ref ?? null,
            kcal: r?.kcal ?? null,
            protein_g: r?.protein_g ?? null,
            carb_g: r?.carb_g ?? null,
            fat_g: r?.fat_g ?? null,
            match_confidence: r?.match_confidence ?? null,
            fell_back: r?.fell_back ?? true,
          };
        });

        // Scanned items: nutrition already resolved client-side via OFF.
        // Cache them in food_cache (best-effort) and append as draft items.
        for (const s of scannedItems) {
          const qn = normalize(s.name);
          await db
            .insert(foodCache)
            .values({
              query_normalized: qn,
              source: "open_food_facts",
              source_ref: s.code,
              kcal_per_100g: String(s.kcal_per_100g),
              protein_per_100g: String(s.protein_per_100g),
              carb_per_100g: String(s.carb_per_100g),
              fat_per_100g: String(s.fat_per_100g),
            })
            .onConflictDoNothing()
            .catch(() => {});
          const kcal = round1((s.kcal_per_100g * s.grams) / 100);
          const protein = round1((s.protein_per_100g * s.grams) / 100);
          const carb = round1((s.carb_per_100g * s.grams) / 100);
          const fat = round1((s.fat_per_100g * s.grams) / 100);
          items.push({
            usda_query: s.name,
            display_name: s.name,
            grams: s.grams,
            user_provided_grams: true,
            logging_mode: "component",
            preparation: "unknown",
            source: "open_food_facts",
            source_ref: s.code,
            kcal,
            protein_g: protein,
            carb_g: carb,
            fat_g: fat,
            match_confidence: 1,
            fell_back: false,
          });
        }

        const bandInputs = items
          .filter((i) => i.kcal != null && i.source != null)
          .map((i) => ({
            kcal: i.kcal as number,
            logging_mode: i.logging_mode,
            // Cast: items with non-null source already match NutritionSource union via DB enum.
            source: i.source as Parameters<typeof mealBand>[0][number]["source"],
          }));
        const band = mealBand(bandInputs);

        const totals: DraftTotals = {
          kcal: round1(items.reduce((a, i) => a + (i.kcal ?? 0), 0)),
          protein_g: round1(items.reduce((a, i) => a + (i.protein_g ?? 0), 0)),
          carb_g: round1(items.reduce((a, i) => a + (i.carb_g ?? 0), 0)),
          fat_g: round1(items.reduce((a, i) => a + (i.fat_g ?? 0), 0)),
          error_band_low: band.low,
          error_band_high: band.high,
        };

        // Build a meal label: prefer Gemini's; fall back to scanned-only label.
        const mealLabel =
          analysis?.parsed.meal_label ??
          (scannedItems.length === 1
            ? scannedItems[0]!.name
            : scannedItems.length > 1
              ? `${scannedItems.length} scanned items`
              : "Meal");

        const draftData: DraftData = {
          meal_label: mealLabel,
          notes: analysis?.parsed.notes,
          items,
          totals,
          photo_path: photoPath,
          transcript,
        };

        // ---- 6. Insert meal_drafts row ----
        await db
          .insert(mealDrafts)
          .values({
            id: draftId,
            user_id: userId,
            draft_data: draftData,
          });

        send({
          type: "draft",
          draftId,
          items,
          totals,
          photo_path: photoPath,
          meal_label: mealLabel,
          notes: analysis?.parsed.notes,
        });
        controller.close();
      } catch (err) {
        const m = err instanceof Error ? err.message : "internal error";
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: m }) + "\n"));
        } catch {
          // controller already closed
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

// ---------- helpers ----------

async function getUserTimezone(userId: string): Promise<string> {
  try {
    const db = getDb();
    const row = await db.query.profiles.findFirst({
      where: eq(profiles.id, userId),
      columns: { timezone: true },
    });
    return row?.timezone ?? "America/Los_Angeles";
  } catch {
    return "America/Los_Angeles";
  }
}

/**
 * Compute the UTC instant that corresponds to the start of "today" in the
 * user's timezone. We use the `userToday` YYYY-MM-DD plus the zone's offset
 * via Date construction (close enough for daily-cost bucketing).
 */
function userDayStartUtc(tz: string): Date {
  const today = userToday(tz); // YYYY-MM-DD in user's tz
  // Construct midnight in user's tz, then convert to UTC by re-formatting.
  // Simpler approach: treat the user's date as a string and convert via Intl.
  // For cost-bucketing we only need an approximate window; midnight UTC of
  // that date is a safe lower bound (might include a sliver of yesterday for
  // negative-offset zones, but that's acceptable for a daily cap).
  return new Date(today + "T00:00:00Z");
}

/**
 * Forward audio to the internal /api/transcribe route, propagating auth
 * cookies via the same Request's headers. Returns null on any error so the
 * caller can continue with whatever text it has.
 */
async function transcribeAudio(req: Request, audio: File): Promise<string | null> {
  try {
    const url = new URL("/api/transcribe", req.url);
    const fd = new FormData();
    fd.set("audio", audio);
    const cookie = req.headers.get("cookie") ?? "";
    const res = await fetch(url, {
      method: "POST",
      body: fd,
      headers: cookie ? { cookie } : {},
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { transcript?: string };
    return j.transcript ?? null;
  } catch {
    return null;
  }
}

/**
 * Race a promise against an AbortSignal. If the signal fires first, throw an
 * abort error; otherwise resolve/reject with the promise. The Gemini SDK
 * doesn't accept an AbortSignal directly, so we wrap it.
 */
function raceWithAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("aborted"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("gemini timeout"));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
