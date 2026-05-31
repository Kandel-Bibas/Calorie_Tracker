"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import {
  meals,
  mealItems,
  mealDrafts,
  streaks,
  foodCache,
  profiles,
} from "@/db/schema";
import { movePhoto, deletePhoto } from "@/lib/storage";
import { resolveItem } from "@/lib/resolve";
import { mealBand, type NutritionSource } from "@/lib/error-bands";
import { updateStreak, type StreakState } from "@/lib/streak";
import { normalize } from "@/lib/normalize";
import { userToday } from "@/lib/dates";
import { tags as cacheTags } from "@/lib/cached";
import type { LoggingMode } from "@/schemas/meal-analysis";

// Shape of the JSON we wrote into meal_drafts.draft_data.
interface DraftItem {
  usda_query: string;
  display_name: string;
  grams: number;
  user_provided_grams: boolean;
  logging_mode: LoggingMode;
  preparation: string;
  composite_components?: string[];
  estimation_basis?: string;
  source: NutritionSource | null;
  source_ref: string | null;
  kcal: number | null;
  protein_g: number | null;
  carb_g: number | null;
  fat_g: number | null;
  match_confidence: number | null;
  fell_back: boolean;
}

interface DraftData {
  meal_label: string;
  notes?: string;
  items: DraftItem[];
  totals: {
    kcal: number;
    protein_g: number;
    carb_g: number;
    fat_g: number;
    error_band_low: number;
    error_band_high: number;
  };
  photo_path: string | null;
  transcript: string | null;
}

export interface SaveMealEdit {
  itemIndex: number;
  grams?: number;
  usda_query?: string;
  display_name?: string;
}

export interface SaveMealInput {
  draftId: string;
  edits?: SaveMealEdit[];
  mealType?: "breakfast" | "lunch" | "dinner" | "snack";
  consumedAt?: string; // ISO; defaults to now()
}

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  return user.id;
}

/**
 * Save a meal draft → permanent `meals` + `meal_items` rows.
 *
 * Applies any user edits (grams / usda_query / display_name) by re-scaling
 * from the per-100g values we already cached during /api/analyze. We do NOT
 * call Gemini again here; for unknown queries we fall back to `resolveItem`
 * which still avoids the LLM and only hits USDA/OFF/cache.
 */
export async function saveMeal(input: SaveMealInput): Promise<{ mealId: string }> {
  const userId = await requireUserId();
  const db = getDb();

  // 1. Fetch draft (RLS enforces ownership; we still scope explicitly).
  const draft = await db.query.mealDrafts.findFirst({
    where: and(eq(mealDrafts.id, input.draftId), eq(mealDrafts.user_id, userId)),
  });
  if (!draft) throw new Error("draft not found");
  const data = draft.draft_data as DraftData;

  // 2. Apply edits — re-resolve only when query/grams changed.
  const editedItems: DraftItem[] = [];
  for (let i = 0; i < data.items.length; i++) {
    const original = data.items[i]!;
    const edit = input.edits?.find((e) => e.itemIndex === i);
    if (!edit) {
      editedItems.push(original);
      continue;
    }
    const grams = edit.grams ?? original.grams;
    const usda_query = edit.usda_query ?? original.usda_query;
    const display_name = edit.display_name ?? original.display_name;

    if (edit.usda_query && edit.usda_query !== original.usda_query) {
      // Query changed → re-resolve from scratch (no LLM, just USDA/OFF/cache).
      const r = await resolveItem({
        userId,
        usda_query,
        display_name,
        grams,
        preparation: original.preparation,
        logging_mode: original.logging_mode,
      });
      editedItems.push({
        ...original,
        usda_query,
        display_name,
        grams,
        source: r?.source ?? null,
        source_ref: r?.source_ref ?? null,
        kcal: r?.kcal ?? null,
        protein_g: r?.protein_g ?? null,
        carb_g: r?.carb_g ?? null,
        fat_g: r?.fat_g ?? null,
        match_confidence: r?.match_confidence ?? null,
        fell_back: r?.fell_back ?? true,
      });
    } else if (edit.grams != null && original.kcal != null) {
      // Grams only — rescale linearly from the original resolved values.
      const factor = grams / original.grams;
      editedItems.push({
        ...original,
        grams,
        display_name,
        kcal: round1((original.kcal ?? 0) * factor),
        protein_g: round1((original.protein_g ?? 0) * factor),
        carb_g: round1((original.carb_g ?? 0) * factor),
        fat_g: round1((original.fat_g ?? 0) * factor),
      });
    } else {
      // Name-only edit, or grams edit without a resolved baseline.
      editedItems.push({ ...original, grams, display_name, usda_query });
    }
  }

  // 3. Recompute totals + error band from the edited items.
  const totals = computeTotals(editedItems);

  // 4. Insert meal + items in a transaction.
  const consumedAt = input.consumedAt ? new Date(input.consumedAt) : new Date();
  const mealId = await db.transaction(async (tx) => {
    const [m] = await tx
      .insert(meals)
      .values({
        user_id: userId,
        consumed_at: consumedAt,
        meal_type: input.mealType ?? null,
        photo_path: data.photo_path,
        voice_transcript: data.transcript,
        total_kcal: String(totals.kcal),
        total_protein_g: String(totals.protein_g),
        total_carb_g: String(totals.carb_g),
        total_fat_g: String(totals.fat_g),
        error_band_low: String(totals.error_band_low),
        error_band_high: String(totals.error_band_high),
        gemini_raw: { meal_label: data.meal_label, notes: data.notes, items: data.items },
      })
      .returning({ id: meals.id });
    if (!m) throw new Error("insert meal failed");
    const newMealId = m.id;

    if (editedItems.length > 0) {
      await tx.insert(mealItems).values(
        editedItems.map((it) => ({
          meal_id: newMealId,
          user_id: userId,
          food_name: it.usda_query,
          display_name: it.display_name,
          grams: String(it.grams),
          kcal: String(it.kcal ?? 0),
          protein_g: it.protein_g != null ? String(it.protein_g) : null,
          carb_g: it.carb_g != null ? String(it.carb_g) : null,
          fat_g: it.fat_g != null ? String(it.fat_g) : null,
          logging_mode: it.logging_mode,
          user_provided_grams: it.user_provided_grams,
          source: it.source,
          source_ref: it.source_ref,
          match_confidence: it.match_confidence != null ? String(it.match_confidence) : null,
          user_edited: input.edits?.some((e) => e.itemIndex === editedItems.indexOf(it)) ?? false,
        })),
      );
    }

    // Streak update — scoped to user's day.
    const tz = await getUserTimezone(userId);
    const todayIso = userToday(tz);
    const prevStreak = await tx.query.streaks.findFirst({
      where: eq(streaks.user_id, userId),
    });
    const next = updateStreak(rowToStreak(prevStreak), todayIso);
    if (prevStreak) {
      await tx
        .update(streaks)
        .set({
          current_length: next.current_length,
          longest_length: next.longest_length,
          last_logged_date: next.last_logged_date,
          freeze_count: next.freeze_count,
        })
        .where(eq(streaks.user_id, userId));
    } else {
      await tx.insert(streaks).values({
        user_id: userId,
        current_length: next.current_length,
        longest_length: next.longest_length,
        last_logged_date: next.last_logged_date,
        freeze_count: next.freeze_count,
      });
    }

    // Delete the draft row.
    await tx.delete(mealDrafts).where(eq(mealDrafts.id, input.draftId));

    return newMealId;
  });

  // 5. Move photo: draft path → permanent meal path.
  if (data.photo_path) {
    const newPath = `${userId}/${mealId}.jpg`;
    try {
      await movePhoto(data.photo_path, newPath);
      await db.update(meals).set({ photo_path: newPath }).where(eq(meals.id, mealId));
    } catch {
      // Non-fatal: leave the photo at the draft path; UI can still resolve it.
    }
  }

  // Saving a meal may have updated the streak — bust its cache.
  updateTag(cacheTags.streak(userId));
  revalidatePath("/today");
  return { mealId };
}

export interface EditMealEdit {
  itemId: string;
  grams?: number;
  usda_query?: string;
  display_name?: string;
}

/**
 * Edit an existing meal's items. Recompute kcal/macros either by scaling
 * from the row's stored values (if only grams changed and the source is
 * still known) or by re-resolving via cache/USDA when the query changed.
 */
export async function editMeal(
  mealId: string,
  edits: EditMealEdit[],
): Promise<void> {
  const userId = await requireUserId();
  const db = getDb();

  const existing = await db.query.meals.findFirst({
    where: and(eq(meals.id, mealId), eq(meals.user_id, userId)),
  });
  if (!existing) throw new Error("meal not found");

  const itemRows = await db.query.mealItems.findMany({
    where: eq(mealItems.meal_id, mealId),
  });

  // Build a working set: map by id for fast edit lookup.
  type Working = {
    id: string;
    food_name: string;
    display_name: string;
    grams: number;
    kcal: number;
    protein_g: number;
    carb_g: number;
    fat_g: number;
    logging_mode: LoggingMode;
    source: NutritionSource | null;
    source_ref: string | null;
    match_confidence: number;
    user_provided_grams: boolean;
    user_edited: boolean;
  };
  const working: Working[] = itemRows.map((r) => ({
    id: r.id,
    food_name: r.food_name,
    display_name: r.display_name,
    grams: Number(r.grams),
    kcal: Number(r.kcal),
    protein_g: Number(r.protein_g ?? 0),
    carb_g: Number(r.carb_g ?? 0),
    fat_g: Number(r.fat_g ?? 0),
    logging_mode: (r.logging_mode as LoggingMode) ?? "composite",
    source: (r.source as NutritionSource) ?? null,
    source_ref: r.source_ref,
    match_confidence: Number(r.match_confidence ?? 0),
    user_provided_grams: r.user_provided_grams,
    user_edited: r.user_edited ?? false,
  }));

  for (const edit of edits) {
    const idx = working.findIndex((w) => w.id === edit.itemId);
    if (idx === -1) continue;
    const cur = working[idx]!;
    const newGrams = edit.grams ?? cur.grams;
    const newQuery = edit.usda_query ?? cur.food_name;
    const newName = edit.display_name ?? cur.display_name;

    if (edit.usda_query && edit.usda_query !== cur.food_name) {
      // Query change → re-resolve through the full pipeline.
      const r = await resolveItem({
        userId,
        usda_query: newQuery,
        display_name: newName,
        grams: newGrams,
        logging_mode: cur.logging_mode,
      });
      working[idx] = {
        ...cur,
        food_name: newQuery,
        display_name: newName,
        grams: newGrams,
        kcal: r?.kcal ?? 0,
        protein_g: r?.protein_g ?? 0,
        carb_g: r?.carb_g ?? 0,
        fat_g: r?.fat_g ?? 0,
        source: r?.source ?? cur.source,
        source_ref: r?.source_ref ?? cur.source_ref,
        match_confidence: r?.match_confidence ?? cur.match_confidence,
        user_edited: true,
      };
    } else if (edit.grams != null && edit.grams !== cur.grams) {
      // Grams change only. Look up per-100g from food_cache via query_normalized
      // and rescale. Fall back to linear scale of stored row if cache miss.
      const qn = normalize(newQuery);
      const cached = await db.query.foodCache.findFirst({
        where: eq(foodCache.query_normalized, qn),
      });
      if (cached) {
        const factor = newGrams / 100;
        working[idx] = {
          ...cur,
          display_name: newName,
          grams: newGrams,
          kcal: round1(Number(cached.kcal_per_100g) * factor),
          protein_g: round1(Number(cached.protein_per_100g ?? 0) * factor),
          carb_g: round1(Number(cached.carb_per_100g ?? 0) * factor),
          fat_g: round1(Number(cached.fat_per_100g ?? 0) * factor),
          user_edited: true,
        };
      } else if (cur.grams > 0) {
        const factor = newGrams / cur.grams;
        working[idx] = {
          ...cur,
          display_name: newName,
          grams: newGrams,
          kcal: round1(cur.kcal * factor),
          protein_g: round1(cur.protein_g * factor),
          carb_g: round1(cur.carb_g * factor),
          fat_g: round1(cur.fat_g * factor),
          user_edited: true,
        };
      } else {
        working[idx] = { ...cur, display_name: newName, grams: newGrams, user_edited: true };
      }
    } else {
      working[idx] = { ...cur, display_name: newName, user_edited: true };
    }
  }

  // Recompute totals + error band.
  const totals = computeTotals(
    working.map((w) => ({
      kcal: w.kcal,
      protein_g: w.protein_g,
      carb_g: w.carb_g,
      fat_g: w.fat_g,
      source: w.source,
      logging_mode: w.logging_mode,
    })),
  );

  await db.transaction(async (tx) => {
    for (const w of working) {
      await tx
        .update(mealItems)
        .set({
          food_name: w.food_name,
          display_name: w.display_name,
          grams: String(w.grams),
          kcal: String(w.kcal),
          protein_g: String(w.protein_g),
          carb_g: String(w.carb_g),
          fat_g: String(w.fat_g),
          source: w.source,
          source_ref: w.source_ref,
          match_confidence: String(w.match_confidence),
          user_edited: w.user_edited,
        })
        .where(eq(mealItems.id, w.id));
    }
    await tx
      .update(meals)
      .set({
        total_kcal: String(totals.kcal),
        total_protein_g: String(totals.protein_g),
        total_carb_g: String(totals.carb_g),
        total_fat_g: String(totals.fat_g),
        error_band_low: String(totals.error_band_low),
        error_band_high: String(totals.error_band_high),
        edited_at: new Date(),
      })
      .where(eq(meals.id, mealId));
  });

  revalidatePath("/today");
}

/**
 * Delete a meal. Cascade removes meal_items. We also recompute the streak:
 * if the deleted meal was the user's only log for `last_logged_date`, the
 * streak's `last_logged_date` may need to roll back. For v1 we keep this
 * conservative — we leave the streak alone (it's already-credited history),
 * which matches the spec's "no retroactive penalty" tone.
 */
export async function deleteMeal(mealId: string): Promise<void> {
  const userId = await requireUserId();
  const db = getDb();

  const m = await db.query.meals.findFirst({
    where: and(eq(meals.id, mealId), eq(meals.user_id, userId)),
    columns: { id: true, photo_path: true },
  });
  if (!m) throw new Error("meal not found");

  await db.delete(meals).where(eq(meals.id, mealId));

  // Best-effort photo cleanup.
  if (m.photo_path) {
    try {
      await deletePhoto(m.photo_path);
    } catch {
      // ignore
    }
  }

  revalidatePath("/today");
}

// ---------- helpers ----------

interface TotalsInputItem {
  kcal: number | null;
  protein_g: number | null;
  carb_g: number | null;
  fat_g: number | null;
  source: NutritionSource | null;
  logging_mode: LoggingMode;
}

function computeTotals(items: TotalsInputItem[]) {
  const kcal = round1(items.reduce((a, i) => a + (i.kcal ?? 0), 0));
  const protein_g = round1(items.reduce((a, i) => a + (i.protein_g ?? 0), 0));
  const carb_g = round1(items.reduce((a, i) => a + (i.carb_g ?? 0), 0));
  const fat_g = round1(items.reduce((a, i) => a + (i.fat_g ?? 0), 0));
  const bandInputs = items
    .filter((i) => i.kcal != null && i.source != null)
    .map((i) => ({
      kcal: i.kcal as number,
      logging_mode: i.logging_mode,
      source: i.source as NutritionSource,
    }));
  const band = mealBand(bandInputs);
  return {
    kcal,
    protein_g,
    carb_g,
    fat_g,
    error_band_low: band.low,
    error_band_high: band.high,
  };
}

function rowToStreak(
  row:
    | {
        current_length: number | null;
        longest_length: number | null;
        last_logged_date: string | null;
        freeze_count: number | null;
      }
    | undefined,
): StreakState {
  return {
    current_length: row?.current_length ?? 0,
    longest_length: row?.longest_length ?? 0,
    last_logged_date: row?.last_logged_date ?? null,
    freeze_count: row?.freeze_count ?? 0,
  };
}

async function getUserTimezone(userId: string): Promise<string> {
  const db = getDb();
  const p = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId),
    columns: { timezone: true },
  });
  return p?.timezone ?? "America/Los_Angeles";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
