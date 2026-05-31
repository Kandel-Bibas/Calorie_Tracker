/**
 * Cross-request caches for slow-changing user data.
 *
 * These wrap DB reads in `unstable_cache` so repeat renders (within the same
 * user) skip Postgres entirely. Each Server Action that mutates one of these
 * MUST call the matching `revalidateTag` afterwards (see actions/*.ts).
 */
import { unstable_cache } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { profiles, goals, streaks } from "@/db/schema";

/** Cache tags. Use the same key everywhere we revalidate. */
export const tags = {
  profile: (userId: string) => `profile:${userId}`,
  activeGoal: (userId: string) => `goal:${userId}`,
  streak: (userId: string) => `streak:${userId}`,
};

const ONE_HOUR_S = 3600;

export function getCachedProfile(userId: string) {
  return unstable_cache(
    async () => {
      const db = getDb();
      return db.query.profiles.findFirst({ where: eq(profiles.id, userId) });
    },
    ["profile", userId],
    { tags: [tags.profile(userId)], revalidate: ONE_HOUR_S },
  )();
}

export function getCachedActiveGoal(userId: string) {
  return unstable_cache(
    async () => {
      const db = getDb();
      return db.query.goals.findFirst({
        where: and(eq(goals.user_id, userId), isNull(goals.superseded_at)),
        orderBy: (g, { desc }) => [desc(g.activated_at)],
      });
    },
    ["goal", userId],
    { tags: [tags.activeGoal(userId)], revalidate: ONE_HOUR_S },
  )();
}

export function getCachedStreak(userId: string) {
  return unstable_cache(
    async () => {
      const db = getDb();
      return db.query.streaks.findFirst({ where: eq(streaks.user_id, userId) });
    },
    ["streak", userId],
    { tags: [tags.streak(userId)], revalidate: ONE_HOUR_S },
  )();
}
