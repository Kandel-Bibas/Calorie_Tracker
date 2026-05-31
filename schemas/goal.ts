import { z } from "zod";

export const IntentEnum = z.enum(["lose", "maintain", "gain", "track"]);
export type Intent = z.infer<typeof IntentEnum>;

export const PaceEnum = z.enum(["easy", "steady", "aggressive"]);
export type Pace = z.infer<typeof PaceEnum>;

export const GoalSchema = z.object({
  intent: IntentEnum,
  target_weight_kg: z.number().min(20).max(300).optional(),
  pace: PaceEnum.optional(),
  daily_kcal: z.number().int().min(800).max(6000),
  protein_g: z.number().int().min(0).max(500).optional(),
  carb_g: z.number().int().min(0).max(1000).optional(),
  fat_g: z.number().int().min(0).max(400).optional(),
  reminder_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});

export type Goal = z.infer<typeof GoalSchema>;
