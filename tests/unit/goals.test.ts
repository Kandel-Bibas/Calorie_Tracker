import { describe, it, expect } from "vitest";
import {
  mifflinStJeor,
  applyPaceAdjustment,
  computeMacroSplit,
  estimateArrivalDate,
} from "@/lib/goals";

describe("mifflinStJeor", () => {
  it("male reference: 28y, 178cm, 78kg → 2109 (BMR 1757.5 × 1.2)", () => {
    expect(
      mifflinStJeor({ sex: "male", age: 28, height_cm: 178, weight_kg: 78 }),
    ).toBe(2109);
  });

  it("female reference: 30y, 165cm, 62kg → 1608 (BMR 1340.25 × 1.2)", () => {
    expect(
      mifflinStJeor({ sex: "female", age: 30, height_cm: 165, weight_kg: 62 }),
    ).toBe(1608);
  });

  it("prefer_not falls between male and female values", () => {
    const male = mifflinStJeor({
      sex: "male", age: 28, height_cm: 178, weight_kg: 78,
    });
    const female = mifflinStJeor({
      sex: "female", age: 28, height_cm: 178, weight_kg: 78,
    });
    const neutral = mifflinStJeor({
      sex: "prefer_not", age: 28, height_cm: 178, weight_kg: 78,
    });
    expect(neutral).toBeLessThan(male);
    expect(neutral).toBeGreaterThan(female);
  });
});

describe("applyPaceAdjustment", () => {
  it("lose+steady cuts 500 kcal", () => {
    expect(applyPaceAdjustment(2400, "lose", "steady")).toBe(1900);
  });
  it("lose+easy cuts 250", () => {
    expect(applyPaceAdjustment(2400, "lose", "easy")).toBe(2150);
  });
  it("lose+aggressive cuts 750", () => {
    expect(applyPaceAdjustment(2400, "lose", "aggressive")).toBe(1650);
  });
  it("gain mirrors lose", () => {
    expect(applyPaceAdjustment(2400, "gain", "steady")).toBe(2900);
  });
  it("maintain is identity", () => {
    expect(applyPaceAdjustment(2400, "maintain", "steady")).toBe(2400);
  });
  it("track returns input unchanged", () => {
    expect(applyPaceAdjustment(2400, "track", "steady")).toBe(2400);
  });
  it("clamps to 1200 floor", () => {
    expect(applyPaceAdjustment(1600, "lose", "aggressive")).toBe(1200);
  });
});

describe("computeMacroSplit", () => {
  it("p/c/f grams sum within 50 kcal of target", () => {
    const split = computeMacroSplit(2200);
    const kcal = split.protein_g * 4 + split.carb_g * 4 + split.fat_g * 9;
    expect(Math.abs(kcal - 2200)).toBeLessThan(50);
  });

  it("protein matches 30% split for round numbers", () => {
    const split = computeMacroSplit(2000);
    expect(split.protein_g).toBe(Math.round((2000 * 0.3) / 4));
  });
});

describe("estimateArrivalDate", () => {
  it("returns null if already at target", () => {
    expect(estimateArrivalDate(75, 75, "steady")).toBeNull();
  });

  it("losing 5kg at steady pace → ~77 days", () => {
    const d = estimateArrivalDate(80, 75, "steady", new Date("2026-01-01"));
    expect(d).toBeInstanceOf(Date);
    // 5kg × 7700 / 500 = 77 days
    const days =
      Math.round((d!.getTime() - new Date("2026-01-01").getTime()) / 86400000);
    expect(days).toBe(77);
  });
});
