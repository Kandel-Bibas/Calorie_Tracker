"use server";

import { and, desc, eq, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { waterLogs, profiles } from "@/db/schema";
import { userDayRangeUtc } from "@/lib/dates";

const MAX_DRINK_ML = 5000;

/** Resolve the signed-in user + their timezone, or throw. */
async function authedContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  const db = getDb();
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, user.id),
    columns: { timezone: true },
  });
  return { db, userId: user.id, tz: profile?.timezone ?? "America/Los_Angeles" };
}

/** Sum of today's water (ml) in the user's timezone. */
async function sumToday(
  db: ReturnType<typeof getDb>,
  userId: string,
  tz: string,
): Promise<number> {
  const { start, end } = userDayRangeUtc(tz);
  const rows = await db.query.waterLogs.findMany({
    where: and(
      eq(waterLogs.user_id, userId),
      gte(waterLogs.logged_at, start),
      lte(waterLogs.logged_at, end),
    ),
    columns: { amount_ml: true },
  });
  return rows.reduce((a, r) => a + (r.amount_ml ?? 0), 0);
}

/** Log a drink (amount in ml). Returns today's new total (ml). */
export async function addWater(amountMl: number): Promise<{ totalMl: number }> {
  if (!Number.isFinite(amountMl) || amountMl <= 0 || amountMl > MAX_DRINK_ML) {
    throw new Error("amount out of range (1-5000 ml)");
  }
  const { db, userId, tz } = await authedContext();
  await db.insert(waterLogs).values({ user_id: userId, amount_ml: Math.round(amountMl) });
  const totalMl = await sumToday(db, userId, tz);
  revalidatePath("/today");
  return { totalMl };
}

/** Delete the most recent drink logged today (undo). Returns new total (ml). */
export async function undoLastWater(): Promise<{ totalMl: number }> {
  const { db, userId, tz } = await authedContext();
  const { start, end } = userDayRangeUtc(tz);
  const last = await db.query.waterLogs.findFirst({
    where: and(
      eq(waterLogs.user_id, userId),
      gte(waterLogs.logged_at, start),
      lte(waterLogs.logged_at, end),
    ),
    orderBy: [desc(waterLogs.logged_at)],
    columns: { id: true },
  });
  if (last) await db.delete(waterLogs).where(eq(waterLogs.id, last.id));
  const totalMl = await sumToday(db, userId, tz);
  revalidatePath("/today");
  return { totalMl };
}
