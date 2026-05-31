"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { completeOnboarding } from "@/actions/goals";
import {
  mifflinStJeor,
  applyPaceAdjustment,
  computeMacroSplit,
} from "@/lib/goals";

/**
 * Shape of the localStorage `onboarding_state` blob the client posts here.
 * Mirrors `lib/onboarding-state.ts` `OnboardingState`.
 */
const RawSchema = z.object({
  intent: z.enum(["lose", "maintain", "gain", "track"]),
  sex: z.enum(["male", "female", "prefer_not"]),
  birth_year: z.number().int().min(1900).max(new Date().getFullYear() - 5),
  height_cm: z.number().int().min(50).max(280),
  current_weight_kg: z.number().min(20).max(300),
  target_weight_kg: z.number().min(20).max(300).optional(),
  pace: z.enum(["easy", "steady", "aggressive"]).optional(),
  daily_kcal: z.number().int().min(800).max(6000).optional(),
  reminder_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  timezone: z.string().default("America/Los_Angeles"),
  units_weight: z.enum(["lb", "kg"]).default("lb"),
  units_height: z.enum(["ft", "cm"]).default("ft"),
});

export type ClaimOnboardingResult =
  | { ok: true; alreadyClaimed: boolean }
  | { ok: false; error: string };

/**
 * Apply a localStorage-collected onboarding draft to the signed-in user.
 *
 * Idempotent: if the user already has a profile row, we no-op and return
 * `alreadyClaimed: true`. This lets us call this safely on every (app) page
 * mount — only the first call after signup does any work.
 */
export async function claimOnboarding(raw: unknown): Promise<ClaimOnboardingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const db = getDb();
  const existing = await db.query.profiles.findFirst({
    where: eq(profiles.id, user.id),
  });
  if (existing) {
    return { ok: true, alreadyClaimed: true };
  }

  const parsed = RawSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid state" };
  }

  const s = parsed.data;
  const age = new Date().getFullYear() - s.birth_year;
  const tdee = mifflinStJeor({
    sex: s.sex,
    age,
    height_cm: s.height_cm,
    weight_kg: s.current_weight_kg,
  });
  const daily_kcal =
    s.daily_kcal ??
    applyPaceAdjustment(tdee, s.intent, s.pace ?? "steady");
  const macros = computeMacroSplit(daily_kcal);

  await completeOnboarding({
    profile: {
      sex: s.sex,
      birth_year: s.birth_year,
      height_cm: s.height_cm,
      units_weight: s.units_weight,
      units_height: s.units_height,
      timezone: s.timezone,
    },
    goal: {
      intent: s.intent,
      target_weight_kg: s.target_weight_kg,
      pace: s.pace,
      daily_kcal,
      protein_g: macros.protein_g,
      carb_g: macros.carb_g,
      fat_g: macros.fat_g,
      reminder_time: s.reminder_time ?? undefined,
    },
    firstWeightKg: s.current_weight_kg,
  });

  return { ok: true, alreadyClaimed: false };
}
