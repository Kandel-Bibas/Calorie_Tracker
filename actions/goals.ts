"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { profiles, goals, weights, streaks } from "@/db/schema";
import { GoalSchema, type Goal } from "@/schemas/goal";
import { ProfileSchema, type Profile } from "@/schemas/profile";
import {
  mifflinStJeor,
  applyPaceAdjustment,
  computeMacroSplit,
} from "@/lib/goals";
import { tags as cacheTags } from "@/lib/cached";

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  return user.id;
}

/**
 * Insert a new goal row and supersede the previously active one. Computes
 * `daily_kcal` via Mifflin-St Jeor (requires a profile + a current weight)
 * if the caller didn't supply it. Macro split defaults to 30/40/30.
 */
export async function updateGoal(input: Goal): Promise<{ goalId: string }> {
  const parsed = GoalSchema.parse(input);
  const userId = await requireUserId();
  const db = getDb();

  let daily_kcal = parsed.daily_kcal;

  if (!parsed.daily_kcal) {
    // Should be unreachable: schema requires daily_kcal. Kept as a guard in
    // case the schema relaxes later.
    daily_kcal = await computeDefaultKcal(userId, parsed);
  }

  const macros =
    parsed.protein_g != null && parsed.carb_g != null && parsed.fat_g != null
      ? { protein_g: parsed.protein_g, carb_g: parsed.carb_g, fat_g: parsed.fat_g }
      : computeMacroSplit(daily_kcal);

  const goalId = await db.transaction(async (tx) => {
    // Mark any active goals as superseded.
    await tx
      .update(goals)
      .set({ superseded_at: sql`now()` })
      .where(and(eq(goals.user_id, userId), isNull(goals.superseded_at)));

    const [row] = await tx
      .insert(goals)
      .values({
        user_id: userId,
        intent: parsed.intent,
        target_weight_kg:
          parsed.target_weight_kg != null ? String(parsed.target_weight_kg) : null,
        pace: parsed.pace ?? null,
        daily_kcal,
        protein_g: macros.protein_g,
        carb_g: macros.carb_g,
        fat_g: macros.fat_g,
      })
      .returning({ id: goals.id });
    if (!row) throw new Error("insert goal failed");
    return row.id;
  });

  updateTag(cacheTags.activeGoal(userId));
  revalidatePath("/settings");
  revalidatePath("/today");
  return { goalId };
}

export interface CompleteOnboardingInput {
  profile: Profile;
  goal: Goal;
  firstWeightKg?: number;
}

/**
 * Finish onboarding: upsert profile, insert first goal, insert first weight
 * (if provided), and seed an empty streak row. Idempotent on profile/streak.
 */
export async function completeOnboarding(
  input: CompleteOnboardingInput,
): Promise<{ goalId: string }> {
  const profileParsed = ProfileSchema.parse(input.profile);
  const goalParsed = GoalSchema.parse(input.goal);
  const userId = await requireUserId();
  const db = getDb();

  await db.transaction(async (tx) => {
    // Upsert profile.
    await tx
      .insert(profiles)
      .values({
        id: userId,
        display_name: profileParsed.display_name ?? null,
        sex: profileParsed.sex,
        birth_year: profileParsed.birth_year,
        height_cm: profileParsed.height_cm,
        units_weight: profileParsed.units_weight,
        units_height: profileParsed.units_height,
        timezone: profileParsed.timezone,
      })
      .onConflictDoUpdate({
        target: profiles.id,
        set: {
          display_name: profileParsed.display_name ?? null,
          sex: profileParsed.sex,
          birth_year: profileParsed.birth_year,
          height_cm: profileParsed.height_cm,
          units_weight: profileParsed.units_weight,
          units_height: profileParsed.units_height,
          timezone: profileParsed.timezone,
        },
      });

    // Seed an empty streak row (idempotent).
    await tx
      .insert(streaks)
      .values({
        user_id: userId,
        current_length: 0,
        longest_length: 0,
        last_logged_date: null,
        freeze_count: 0,
      })
      .onConflictDoNothing();

    // First weight (one row per user-day).
    if (input.firstWeightKg != null) {
      const today = new Date().toISOString().slice(0, 10);
      await tx
        .insert(weights)
        .values({
          user_id: userId,
          recorded_on: today,
          weight_kg: String(input.firstWeightKg),
        })
        .onConflictDoUpdate({
          target: [weights.user_id, weights.recorded_on],
          set: { weight_kg: String(input.firstWeightKg) },
        });
    }
  });

  // Now create the initial goal. We do this outside the onboarding tx so
  // updateGoal can compute defaults using the profile + weight we just wrote.
  const { goalId } = await updateGoal(goalParsed);

  // Bust the cached profile + streak entries we just wrote.
  updateTag(cacheTags.profile(userId));
  updateTag(cacheTags.streak(userId));
  revalidatePath("/today");
  revalidatePath("/settings");
  return { goalId };
}

// ---------- helpers ----------

async function computeDefaultKcal(userId: string, goal: Goal): Promise<number> {
  const db = getDb();
  const p = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) });
  if (!p?.sex || !p?.birth_year || !p?.height_cm) {
    throw new Error("profile incomplete; cannot auto-compute daily_kcal");
  }
  const latestWeight = await db.query.weights.findFirst({
    where: eq(weights.user_id, userId),
    orderBy: (w, { desc }) => [desc(w.recorded_on)],
  });
  if (!latestWeight) {
    throw new Error("no weight logged; cannot auto-compute daily_kcal");
  }
  const age = new Date().getFullYear() - p.birth_year;
  const tdee = mifflinStJeor({
    sex: p.sex as "male" | "female" | "prefer_not",
    age,
    height_cm: p.height_cm,
    weight_kg: Number(latestWeight.weight_kg),
  });
  return applyPaceAdjustment(tdee, goal.intent, goal.pace ?? "steady");
}
