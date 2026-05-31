import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { integrations, dailyActivity, weights, workouts } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken, getActivity, getWeights, getWorkouts } from "@/lib/withings";

/**
 * POST /api/withings/sync
 *
 * Pulls the last 30 days of activity + weight from Withings and upserts
 * to `daily_activity` and `weights`. Idempotent — safe to re-run.
 *
 * Triggered by:
 *   - User clicking "Sync now" in /settings
 *   - (Future) a daily Vercel cron at 6 AM
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = user.id;
  const db = getDb();

  const token = await getValidAccessToken(userId);
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 404 });
  }

  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const [activities, weightReadings, workoutList] = await Promise.all([
    getActivity({
      accessToken: token,
      startDate: fmt(thirtyDaysAgo),
      endDate: fmt(today),
    }),
    getWeights({
      accessToken: token,
      startDate: fmt(thirtyDaysAgo),
      endDate: fmt(today),
    }),
    getWorkouts({
      accessToken: token,
      startDate: fmt(thirtyDaysAgo),
      endDate: fmt(today),
    }),
  ]);

  // Upsert daily_activity rows
  for (const a of activities) {
    await db
      .insert(dailyActivity)
      .values({
        user_id: userId,
        date: a.date,
        source: "withings",
        steps: a.steps || null,
        active_kcal: a.active_kcal || null,
        total_kcal: a.total_kcal || null,
        distance_m: a.distance_m || null,
        active_minutes: a.active_minutes || null,
        raw: a.raw as object,
      })
      .onConflictDoUpdate({
        target: [dailyActivity.user_id, dailyActivity.date, dailyActivity.source],
        set: {
          steps: a.steps || null,
          active_kcal: a.active_kcal || null,
          total_kcal: a.total_kcal || null,
          distance_m: a.distance_m || null,
          active_minutes: a.active_minutes || null,
          raw: a.raw as object,
          updated_at: new Date(),
        },
      });
  }

  // Group weight readings by date — keep the most recent reading per day.
  const byDate = new Map<string, number>();
  for (const w of weightReadings) {
    byDate.set(w.date, w.weight_kg);
  }
  for (const [date, weight_kg] of byDate) {
    await db
      .insert(weights)
      .values({
        user_id: userId,
        recorded_on: date,
        weight_kg: String(weight_kg),
      })
      .onConflictDoUpdate({
        target: [weights.user_id, weights.recorded_on],
        set: { weight_kg: String(weight_kg) },
      });
  }

  // Upsert workouts
  for (const w of workoutList) {
    await db
      .insert(workouts)
      .values({
        user_id: userId,
        source: "withings",
        external_id: w.external_id,
        started_at: new Date(w.startdate * 1000),
        ended_at: new Date(w.enddate * 1000),
        category: w.category,
        category_label: w.category_label,
        active_kcal: w.active_kcal || null,
        distance_m: w.distance_m || null,
        duration_s: w.duration_s || null,
        avg_hr: w.avg_hr ?? null,
        max_hr: w.max_hr ?? null,
        raw: w.raw as object,
      })
      .onConflictDoUpdate({
        target: [workouts.user_id, workouts.source, workouts.external_id],
        set: {
          ended_at: new Date(w.enddate * 1000),
          category: w.category,
          category_label: w.category_label,
          active_kcal: w.active_kcal || null,
          distance_m: w.distance_m || null,
          duration_s: w.duration_s || null,
          avg_hr: w.avg_hr ?? null,
          max_hr: w.max_hr ?? null,
          raw: w.raw as object,
        },
      });
  }

  // Mark last sync time on the integration.
  await db
    .update(integrations)
    .set({ last_synced_at: new Date() })
    .where(and(eq(integrations.user_id, userId), eq(integrations.provider, "withings")));

  return NextResponse.json({
    ok: true,
    activity_days: activities.length,
    weight_readings: weightReadings.length,
    workouts: workoutList.length,
  });
}
