import { describe, it, expect } from "vitest";
import { itemBand, mealBand } from "@/lib/error-bands";

describe("itemBand", () => {
  it("component + usda_foundation → ±5%", () => {
    const b = itemBand({ kcal: 100, logging_mode: "component", source: "usda_foundation" });
    expect(b.low).toBe(95);
    expect(b.high).toBe(105);
  });

  it("restaurant_estimate → ±25%", () => {
    const b = itemBand({ kcal: 200, logging_mode: "restaurant_estimate", source: "usda_survey" });
    expect(b.low).toBe(150);
    expect(b.high).toBe(250);
  });

  it("gemini_estimate is always ±35%, regardless of mode", () => {
    const b = itemBand({ kcal: 100, logging_mode: "component", source: "gemini_estimate" });
    expect(b.low).toBe(65);
    expect(b.high).toBe(135);
  });

  it("composite + usda_survey → ±12%", () => {
    const b = itemBand({ kcal: 500, logging_mode: "composite", source: "usda_survey" });
    expect(b.low).toBe(440);
    expect(b.high).toBe(560);
  });

  it("saved_recipe + user_override → ±8%", () => {
    const b = itemBand({ kcal: 200, logging_mode: "saved_recipe", source: "user_override" });
    expect(b.low).toBe(184);
    expect(b.high).toBe(216);
  });
});

describe("mealBand", () => {
  it("sums per-item bands", () => {
    const meal = mealBand([
      { kcal: 100, logging_mode: "component", source: "usda_foundation" },
      { kcal: 200, logging_mode: "component", source: "usda_foundation" },
    ]);
    expect(meal.low).toBe(285);
    expect(meal.high).toBe(315);
  });

  it("empty meal returns zero band", () => {
    expect(mealBand([])).toEqual({ low: 0, high: 0 });
  });
});
