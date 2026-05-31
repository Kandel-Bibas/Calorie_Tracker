import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { scale, rankUsdaResults, extractNutrients, searchUsda } from "@/lib/usda";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("scale", () => {
  it("linearly scales per-100g to actual grams", () => {
    const r = scale({ kcal: 158, protein: 5.8, carb: 31, fat: 0.9 }, 220);
    expect(r.kcal).toBeCloseTo(347.6, 1);
    expect(r.protein).toBeCloseTo(12.8, 1);
  });

  it("scaling to 0 grams yields zeros", () => {
    expect(scale({ kcal: 100, protein: 5, carb: 10, fat: 2 }, 0)).toEqual({
      kcal: 0, protein: 0, carb: 0, fat: 0,
    });
  });
});

describe("extractNutrients", () => {
  it("reads from new-style nutrient.id + amount", () => {
    expect(
      extractNutrients({
        foodNutrients: [
          { nutrient: { id: 1008 }, amount: 158 },
          { nutrient: { id: 1003 }, amount: 5.8 },
        ],
      }),
    ).toEqual({ kcal: 158, protein: 5.8, carb: 0, fat: 0 });
  });

  it("reads from legacy nutrientId + value", () => {
    expect(
      extractNutrients({
        foodNutrients: [
          { nutrientId: 1008, value: 158 },
          { nutrientId: 1003, value: 5.8 },
          { nutrientId: 1005, value: 31 },
          { nutrientId: 1004, value: 0.9 },
        ],
      }),
    ).toEqual({ kcal: 158, protein: 5.8, carb: 31, fat: 0.9 });
  });
});

describe("rankUsdaResults", () => {
  it("prefers exact name match over fuzzy", () => {
    const winner = rankUsdaResults(
      [
        { fdcId: 1, description: "Spaghetti, dry",    dataType: "Foundation" },
        { fdcId: 2, description: "Spaghetti, cooked", dataType: "Foundation" },
      ],
      "spaghetti cooked",
      "cooked",
    );
    expect(winner.fdcId).toBe(2);
  });

  it("strongly avoids raw match when query is cooked", () => {
    const winner = rankUsdaResults(
      [
        // Raw entry first to mimic USDA's actual response ordering for "rice white"
        { fdcId: 1, description: "Rice, white, long-grain, regular, raw, unenriched", dataType: "Foundation" },
        { fdcId: 2, description: "Rice, white, long-grain, regular, cooked, unenriched", dataType: "Foundation" },
      ],
      "rice white",
      "cooked",
    );
    expect(winner.fdcId).toBe(2);
  });

  it("avoids boiled when query is fried", () => {
    const winner = rankUsdaResults(
      [
        { fdcId: 1, description: "Potatoes, boiled, without skin", dataType: "Foundation" },
        { fdcId: 2, description: "Potatoes, pan-fried, with oil", dataType: "Foundation" },
      ],
      "potatoes pan-fried",
      "fried",
    );
    expect(winner.fdcId).toBe(2);
  });

  it("penalizes Branded relative to Foundation", () => {
    const winner = rankUsdaResults(
      [
        { fdcId: 1, description: "Spaghetti", dataType: "Branded" },
        { fdcId: 2, description: "Spaghetti", dataType: "Foundation" },
      ],
      "spaghetti",
    );
    expect(winner.fdcId).toBe(2);
  });
});

describe("searchUsda", () => {
  it("returns first matching food with per-100g extracted", async () => {
    server.use(
      http.get("https://api.nal.usda.gov/fdc/v1/foods/search", () =>
        HttpResponse.json({
          foods: [
            {
              fdcId: 168927,
              description: "Spaghetti, cooked",
              dataType: "Foundation",
              foodNutrients: [
                { nutrientId: 1008, value: 158 },
                { nutrientId: 1003, value: 5.8 },
                { nutrientId: 1005, value: 31 },
                { nutrientId: 1004, value: 0.9 },
              ],
            },
          ],
        }),
      ),
    );
    const r = await searchUsda("spaghetti", "cooked");
    expect(r?.fdcId).toBe(168927);
    expect(r?.kcal_per_100g).toBe(158);
    expect(r?.protein_per_100g).toBe(5.8);
  });

  it("returns null on empty result set", async () => {
    server.use(
      http.get("https://api.nal.usda.gov/fdc/v1/foods/search", () =>
        HttpResponse.json({ foods: [] }),
      ),
    );
    expect(await searchUsda("widget")).toBeNull();
  });

  it("returns null when API errors", async () => {
    server.use(
      http.get("https://api.nal.usda.gov/fdc/v1/foods/search", () =>
        HttpResponse.json({ error: "rate limited" }, { status: 429 }),
      ),
    );
    expect(await searchUsda("spaghetti")).toBeNull();
  });

  it("returns null when winner has no kcal", async () => {
    server.use(
      http.get("https://api.nal.usda.gov/fdc/v1/foods/search", () =>
        HttpResponse.json({
          foods: [
            {
              fdcId: 1,
              description: "Mystery food",
              dataType: "Branded",
              foodNutrients: [{ nutrientId: 1003, value: 5 }], // protein only
            },
          ],
        }),
      ),
    );
    expect(await searchUsda("mystery")).toBeNull();
  });
});
