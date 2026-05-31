import { describe, it, expect } from "vitest";
import { updateStreak } from "@/lib/streak";

const ZERO = {
  current_length: 0,
  longest_length: 0,
  last_logged_date: null,
  freeze_count: 0,
} as const;

describe("updateStreak", () => {
  it("first-ever log: current=1, longest=1", () => {
    const next = updateStreak(ZERO, "2026-05-22");
    expect(next.current_length).toBe(1);
    expect(next.longest_length).toBe(1);
    expect(next.last_logged_date).toBe("2026-05-22");
  });

  it("consecutive day increments", () => {
    const next = updateStreak(
      { current_length: 4, longest_length: 9, last_logged_date: "2026-05-21", freeze_count: 0 },
      "2026-05-22",
    );
    expect(next.current_length).toBe(5);
    expect(next.longest_length).toBe(9);
  });

  it("same-day relog is idempotent", () => {
    const prev = { current_length: 5, longest_length: 9, last_logged_date: "2026-05-22", freeze_count: 0 };
    const next = updateStreak(prev, "2026-05-22");
    expect(next).toEqual(prev);
  });

  it("two-day gap with no freeze resets to 1", () => {
    const next = updateStreak(
      { current_length: 7, longest_length: 7, last_logged_date: "2026-05-20", freeze_count: 0 },
      "2026-05-22",
    );
    expect(next.current_length).toBe(1);
    expect(next.longest_length).toBe(7);
  });

  it("two-day gap with freeze consumes it and keeps streak", () => {
    const next = updateStreak(
      { current_length: 7, longest_length: 7, last_logged_date: "2026-05-20", freeze_count: 1 },
      "2026-05-22",
    );
    expect(next.current_length).toBe(8);
    expect(next.longest_length).toBe(8);
    expect(next.freeze_count).toBe(0);
  });

  it("three-day gap always resets even with freezes", () => {
    const next = updateStreak(
      { current_length: 10, longest_length: 10, last_logged_date: "2026-05-19", freeze_count: 2 },
      "2026-05-22",
    );
    expect(next.current_length).toBe(1);
    expect(next.freeze_count).toBe(2);
  });

  it("new longest updates", () => {
    const next = updateStreak(
      { current_length: 9, longest_length: 9, last_logged_date: "2026-05-21", freeze_count: 0 },
      "2026-05-22",
    );
    expect(next.longest_length).toBe(10);
  });
});
