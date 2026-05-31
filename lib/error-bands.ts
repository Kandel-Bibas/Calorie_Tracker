import type { LoggingMode } from "@/schemas/meal-analysis";

export type NutritionSource =
  | "usda_foundation"
  | "usda_sr"
  | "usda_survey"
  | "usda_branded"
  | "open_food_facts"
  | "user_override"
  | "calorie_ninjas"
  | "fatsecret"
  | "gemini_estimate";

/**
 * Per-item ±% confidence band keyed on (logging_mode, source).
 * Source = "gemini_estimate" overrides everything to ±35%.
 */
const BAND_TABLE: Record<string, number> = {
  "component:usda_foundation": 0.05,
  "component:usda_sr": 0.05,
  "component:usda_survey": 0.08,
  "component:usda_branded": 0.12,
  "component:calorie_ninjas": 0.08,
  "component:fatsecret": 0.07,
  "component:open_food_facts": 0.15,
  "composite:usda_foundation": 0.12,
  "composite:usda_sr": 0.12,
  "composite:usda_survey": 0.12,
  "composite:usda_branded": 0.18,
  "composite:calorie_ninjas": 0.12,
  "composite:fatsecret": 0.12,
  "composite:open_food_facts": 0.18,
  "saved_recipe:user_override": 0.08,
  "saved_recipe:usda_foundation": 0.08,
  "saved_recipe:usda_sr": 0.08,
  "saved_recipe:usda_survey": 0.10,
  "saved_recipe:usda_branded": 0.12,
  "saved_recipe:open_food_facts": 0.15,
  "restaurant_estimate:usda_foundation": 0.25,
  "restaurant_estimate:usda_sr": 0.25,
  "restaurant_estimate:usda_survey": 0.25,
  "restaurant_estimate:usda_branded": 0.25,
  "restaurant_estimate:open_food_facts": 0.25,
};

const GEMINI_ESTIMATE_BAND = 0.35;
const DEFAULT_BAND = 0.20;

export interface ItemBandInput {
  kcal: number;
  logging_mode: LoggingMode;
  source: NutritionSource;
}

export function itemBand(item: ItemBandInput): { low: number; high: number } {
  const pct =
    item.source === "gemini_estimate"
      ? GEMINI_ESTIMATE_BAND
      : BAND_TABLE[`${item.logging_mode}:${item.source}`] ?? DEFAULT_BAND;
  const delta = item.kcal * pct;
  return {
    low: Math.round(item.kcal - delta),
    high: Math.round(item.kcal + delta),
  };
}

export function mealBand(items: ItemBandInput[]): { low: number; high: number } {
  return items.reduce(
    (acc, i) => {
      const b = itemBand(i);
      return { low: acc.low + b.low, high: acc.high + b.high };
    },
    { low: 0, high: 0 },
  );
}
