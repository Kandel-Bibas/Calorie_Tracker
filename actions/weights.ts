"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { weights } from "@/db/schema";

export interface LogWeightInput {
  /** YYYY-MM-DD in the user's timezone. */
  recordedOn: string;
  weightKg: number;
}

/**
 * Upsert one weight reading per (user, day). If the user logs again on the
 * same calendar day the latest value wins.
 */
export async function logWeight(input: LogWeightInput): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.recordedOn)) {
    throw new Error("recordedOn must be YYYY-MM-DD");
  }
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0 || input.weightKg > 500) {
    throw new Error("weightKg out of range");
  }

  const db = getDb();
  await db
    .insert(weights)
    .values({
      user_id: user.id,
      recorded_on: input.recordedOn,
      weight_kg: String(input.weightKg),
    })
    .onConflictDoUpdate({
      target: [weights.user_id, weights.recorded_on],
      set: { weight_kg: String(input.weightKg) },
    });

  revalidatePath("/weight");
  revalidatePath("/today");
}
