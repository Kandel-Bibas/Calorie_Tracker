import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Convert a UTC timestamp to a YYYY-MM-DD string in the user's timezone.
 * Used for grouping meals into "user days" that respect midnight boundaries
 * across timezones.
 */
export function toUserDate(ts: Date, timezone: string): string {
  return formatInTimeZone(ts, timezone, "yyyy-MM-dd");
}

/** Whether two timestamps fall on the same user-day. */
export function isSameUserDay(a: Date, b: Date, timezone: string): boolean {
  return toUserDate(a, timezone) === toUserDate(b, timezone);
}

/** Today's date in the user's timezone, YYYY-MM-DD. */
export function userToday(timezone: string): string {
  return toUserDate(new Date(), timezone);
}

/**
 * Return the UTC instants bounding "this user-day" — i.e. midnight to
 * 23:59:59.999 wall-clock time in the user's timezone, converted to UTC.
 *
 * Use this to bound `consumed_at` queries when filtering meals/workouts
 * by date. Naive `new Date("YYYY-MM-DDT00:00:00")` would be parsed in the
 * SERVER's timezone (UTC on Vercel), which silently drops meals logged
 * late at night in the user's local timezone.
 */
export function userDayRangeUtc(
  timezone: string,
  dateIso?: string,
): { start: Date; end: Date } {
  const date = dateIso ?? userToday(timezone);
  return {
    start: fromZonedTime(`${date} 00:00:00.000`, timezone),
    end: fromZonedTime(`${date} 23:59:59.999`, timezone),
  };
}
