import { z } from "zod";

export const LoggingModeEnum = z.enum([
  "component",
  "composite",
  "restaurant_estimate",
  "saved_recipe",
]);
export type LoggingMode = z.infer<typeof LoggingModeEnum>;

export const PreparationEnum = z.enum([
  "raw",
  "cooked",
  "fried",
  "grilled",
  "baked",
  "boiled",
  "steamed",
  "unknown",
]);

export const FoodItemSchema = z.object({
  usda_query: z
    .string()
    .min(1)
    .max(120)
    .describe(
      "Normalized food name for caching + display. Include preparation when it materially affects nutrition (e.g. 'chicken breast, grilled, skinless')."
    ),
  display_name: z
    .string()
    .min(1)
    .max(80)
    .describe("Clean, human-readable label for the UI."),
  grams: z
    .number()
    .min(1)
    .max(2000)
    .describe(
      "Edible weight in grams. If the user explicitly stated the weight, use it exactly."
    ),
  user_provided_grams: z
    .boolean()
    .describe(
      "TRUE if the user explicitly stated the weight in voice/text. FALSE if estimated."
    ),
  logging_mode: LoggingModeEnum,
  composite_components: z
    .array(z.string())
    .optional()
    .describe(
      "Only when logging_mode='composite'. Ingredients listed by the user."
    ),
  preparation: PreparationEnum,
  estimation_basis: z
    .string()
    .max(160)
    .optional()
    .describe(
      "Only when user_provided_grams=false. Explain how grams were estimated."
    ),

  // ===== Nutrition (per 100g of the food AS PREPARED). Gemini provides these
  // directly now since external API matching (USDA) proved unreliable for
  // edge cases like pan-fried potatoes vs boiled. Cooking method must be
  // baked into the value — e.g. fried potatoes include absorbed oil. =====
  kcal_per_100g: z
    .number()
    .min(0)
    .max(900)
    .describe(
      "Calories per 100 grams of the food AS PREPARED. For fried items, include the absorbed oil. For composite dishes, use the per-100g of the whole dish."
    ),
  protein_per_100g: z
    .number()
    .min(0)
    .max(100)
    .describe("Protein grams per 100 grams of the food as prepared."),
  carb_per_100g: z
    .number()
    .min(0)
    .max(100)
    .describe("Carbohydrate grams per 100 grams of the food as prepared."),
  fat_per_100g: z
    .number()
    .min(0)
    .max(100)
    .describe("Fat grams per 100 grams of the food as prepared."),
});

export const MealAnalysisSchema = z.object({
  items: z.array(FoodItemSchema).min(1).max(15),
  meal_label: z.string().min(1).max(60),
  notes: z.string().max(300).optional(),
});

export type FoodItem = z.infer<typeof FoodItemSchema>;
export type MealAnalysis = z.infer<typeof MealAnalysisSchema>;
