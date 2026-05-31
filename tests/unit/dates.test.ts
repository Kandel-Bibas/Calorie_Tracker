import { describe, it, expect } from "vitest";
import { toUserDate, isSameUserDay, userToday } from "@/lib/dates";

describe("toUserDate", () => {
  it("groups 3:55 AM UTC into previous LA day", () => {
    expect(toUserDate(new Date("2026-05-22T03:55:00Z"), "America/Los_Angeles"))
      .toBe("2026-05-21");
  });

  it("groups noon UTC into same LA day", () => {
    expect(toUserDate(new Date("2026-05-22T19:00:00Z"), "America/Los_Angeles"))
      .toBe("2026-05-22");
  });

  it("respects Asia/Kolkata offset (+5:30)", () => {
    expect(toUserDate(new Date("2026-05-21T20:00:00Z"), "Asia/Kolkata"))
      .toBe("2026-05-22");
  });

  it("UTC timezone returns clock date", () => {
    expect(toUserDate(new Date("2026-05-22T23:55:00Z"), "UTC"))
      .toBe("2026-05-22");
  });
});

describe("isSameUserDay", () => {
  it("two timestamps on same user day", () => {
    expect(
      isSameUserDay(
        new Date("2026-05-22T15:00:00Z"),
        new Date("2026-05-22T23:00:00Z"),
        "America/Los_Angeles",
      ),
    ).toBe(true);
  });

  it("timestamps spanning midnight boundary", () => {
    expect(
      isSameUserDay(
        new Date("2026-05-22T06:00:00Z"),
        new Date("2026-05-22T08:00:00Z"),
        "America/Los_Angeles",
      ),
    ).toBe(false);
  });
});

describe("userToday", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(userToday("America/Los_Angeles")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
