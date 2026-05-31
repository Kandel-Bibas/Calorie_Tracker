import { z } from "zod";

export const SexEnum = z.enum(["male", "female", "prefer_not"]);
export type Sex = z.infer<typeof SexEnum>;

export const ProfileSchema = z.object({
  display_name: z.string().min(1).max(60).optional(),
  sex: SexEnum,
  birth_year: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() - 5),
  height_cm: z.number().int().min(50).max(280),
  units_weight: z.enum(["lb", "kg"]).default("lb"),
  units_height: z.enum(["ft", "cm"]).default("ft"),
  timezone: z.string().default("America/Los_Angeles"),
});

export type Profile = z.infer<typeof ProfileSchema>;
