import { describe, it, expect } from "vitest";
import { zodToGeminiSchema, SYSTEM_PROMPT } from "@/lib/gemini";
import {
  MealAnalysisSchema,
  FoodItemSchema,
  LoggingModeEnum,
} from "@/schemas/meal-analysis";

describe("zodToGeminiSchema", () => {
  it("converts object with required + optional fields", () => {
    const schema = MealAnalysisSchema;
    const json = zodToGeminiSchema(schema) as {
      type: string;
      properties: { items: unknown; meal_label: unknown; notes: unknown };
      required: string[];
    };
    expect(json.type).toBe("object");
    expect(json.required).toContain("items");
    expect(json.required).toContain("meal_label");
    expect(json.required).not.toContain("notes"); // optional
  });

  it("converts enum to string + enum values", () => {
    const json = zodToGeminiSchema(LoggingModeEnum) as { type: string; enum: string[] };
    expect(json.type).toBe("string");
    expect(json.enum).toEqual(["component", "composite", "restaurant_estimate", "saved_recipe"]);
  });

  it("nested object: FoodItemSchema converts cleanly", () => {
    const json = zodToGeminiSchema(FoodItemSchema) as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(json.type).toBe("object");
    expect(json.required).toContain("usda_query");
    expect(json.required).toContain("grams");
    expect(json.required).not.toContain("estimation_basis");
  });

  it("array carries item schema", () => {
    const json = zodToGeminiSchema(MealAnalysisSchema) as {
      properties: { items: { type: string; items: { type: string } } };
    };
    expect(json.properties.items.type).toBe("array");
    expect(json.properties.items.items.type).toBe("object");
  });
});

describe("SYSTEM_PROMPT", () => {
  it("instructs per-100g calorie output", () => {
    expect(SYSTEM_PROMPT).toMatch(/kcal_per_100g/);
  });

  it("instructs trust of user-stated grams", () => {
    expect(SYSTEM_PROMPT).toMatch(/TRUST the user's stated grams/);
  });

  it("documents all four logging modes", () => {
    for (const mode of ["component", "composite", "restaurant_estimate", "saved_recipe"]) {
      expect(SYSTEM_PROMPT).toContain(mode);
    }
  });
});
