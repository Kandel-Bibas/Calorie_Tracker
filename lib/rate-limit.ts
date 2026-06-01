import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiCalls } from "@/db/schema";

export interface RateLimitResult {
  ok: boolean;
  /** User-facing reason when not ok. */
  reason?: string;
  /** Seconds to advise the client to wait (sent as a Retry-After header). */
  retryAfterSec?: number;
}

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

// Caps on AI meal analyses (the Gemini-backed "add food" path). Tunable via env
// without touching code. Defaults are sized for a public demo: generous for
// real use, tight enough to bound shared-key spend if someone abuses it.
const USER_PER_HOUR = envInt("ANALYZE_RL_USER_HOUR", 10);
const USER_PER_DAY = envInt("ANALYZE_RL_USER_DAY", 30);
const GLOBAL_PER_DAY = envInt("ANALYZE_RL_GLOBAL_DAY", 500);

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

async function countAnalyses(opts: { userId?: string; sinceMs: number }): Promise<number> {
  const db = getDb();
  const since = new Date(Date.now() - opts.sinceMs);
  const conds = [eq(aiCalls.call_kind, "analyze"), gte(aiCalls.created_at, since)];
  if (opts.userId) conds.push(eq(aiCalls.user_id, opts.userId));
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiCalls)
    .where(and(...conds));
  return rows[0]?.n ?? 0;
}

/**
 * Rate-limit the Gemini-backed meal analysis ("add food") endpoint. Counts
 * prior `analyze` rows in the shared `ai_calls` table over rolling windows and
 * returns `{ ok: false, reason }` (429-worthy) when a cap is hit.
 *
 * Complements the per-user daily USD cost cap in /api/analyze: counts guard
 * against request floods, the cost cap guards against token blowups, and the
 * global cap protects the shared API key once the app is public.
 */
export async function checkAnalyzeRateLimit(userId: string): Promise<RateLimitResult> {
  const [userHour, userDay, globalDay] = await Promise.all([
    countAnalyses({ userId, sinceMs: HOUR_MS }),
    countAnalyses({ userId, sinceMs: DAY_MS }),
    countAnalyses({ sinceMs: DAY_MS }),
  ]);

  if (userHour >= USER_PER_HOUR) {
    return {
      ok: false,
      reason: `Too many meals in the last hour (limit ${USER_PER_HOUR}). Please try again later.`,
      retryAfterSec: 3600,
    };
  }
  if (userDay >= USER_PER_DAY) {
    return {
      ok: false,
      reason: `You've reached today's limit of ${USER_PER_DAY} AI meal logs. Try again tomorrow.`,
      retryAfterSec: 86400,
    };
  }
  if (globalDay >= GLOBAL_PER_DAY) {
    return {
      ok: false,
      reason: "The demo is at capacity for today. Please try again tomorrow.",
      retryAfterSec: 86400,
    };
  }
  return { ok: true };
}
