import { z } from "zod";

export const RecipeIngredientSchema = z.object({
  display_name: z.string().min(1).max(80),
  usda_query: z.string().min(1).max(120),
  grams: z.number().min(0.1).max(5000),
});

export const RecipeSchema = z.object({
  display_name: z.string().min(1).max(80),
  ingredients: z.array(RecipeIngredientSchema).min(1).max(50),
});

export type Recipe = z.infer<typeof RecipeSchema>;
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;
