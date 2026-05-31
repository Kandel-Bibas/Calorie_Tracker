import { differenceInCalendarDays, parseISO } from "date-fns";

export interface StreakState {
  current_length: number;
  longest_length: number;
  last_logged_date: string | null; // YYYY-MM-DD in user timezone
  freeze_count: number;
}

/**
 * Compute the next streak state given the previous state + today's user-date.
 *
 * Rules:
 * - First-ever log: current = 1, longest = max(1, prev.longest).
 * - Same-day relog: idempotent (no change).
 * - +1 day from last log: increment.
 * - +2 days with freeze available: consume freeze, increment, still counts as streak.
 * - +2 days without freeze, or longer gaps: reset to 1.
 * - longest tracks the historical maximum across all updates.
 */
export function updateStreak(prev: StreakState, todayIso: string): StreakState {
  if (!prev.last_logged_date) {
    return {
      ...prev,
      current_length: 1,
      longest_length: Math.max(1, prev.longest_length),
      last_logged_date: todayIso,
    };
  }

  const gap = differenceInCalendarDays(
    parseISO(todayIso),
    parseISO(prev.last_logged_date),
  );

  if (gap === 0) return prev;

  if (gap === 1) {
    const current = prev.current_length + 1;
    return {
      ...prev,
      current_length: current,
      longest_length: Math.max(prev.longest_length, current),
      last_logged_date: todayIso,
    };
  }

  if (gap === 2 && prev.freeze_count > 0) {
    const current = prev.current_length + 1;
    return {
      ...prev,
      current_length: current,
      longest_length: Math.max(prev.longest_length, current),
      last_logged_date: todayIso,
      freeze_count: prev.freeze_count - 1,
    };
  }

  return {
    ...prev,
    current_length: 1,
    last_logged_date: todayIso,
  };
}
