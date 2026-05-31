import type { Sex } from "@/schemas/profile";
import type { Intent, Pace } from "@/schemas/goal";

const ACTIVITY_FACTOR = 1.2; // sedentary; can be overridden in settings later
const MIN_KCAL_FLOOR = 1200;
const KCAL_PER_KG_BODY_MASS = 7700;

const SEX_OFFSET: Record<Sex, number> = {
  male: 5,
  female: -161,
  prefer_not: -78, // midpoint
};

const PACE_DELTA: Record<Pace, number> = {
  easy: 250,
  steady: 500,
  aggressive: 750,
};

/**
 * Mifflin-St Jeor BMR × sedentary activity factor.
 * Reference for "male, 28y, 178cm, 78kg" → ~1742 (BMR) × 1.2 ≈ 2090.
 * For tests we return the BMR×activity rounded.
 */
export function mifflinStJeor(p: {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
}): number {
  const base = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age;
  const bmr = base + SEX_OFFSET[p.sex];
  return Math.round(bmr * ACTIVITY_FACTOR);
}

/**
 * Apply intent + pace to a TDEE to get a daily kcal target.
 * lose: subtract; gain: add; maintain/track: identity.
 * Clamped to MIN_KCAL_FLOOR (1200).
 */
export function applyPaceAdjustment(
  tdee: number,
  intent: Intent,
  pace: Pace,
): number {
  if (intent === "maintain" || intent === "track") return tdee;
  const delta = PACE_DELTA[pace];
  const target = intent === "lose" ? tdee - delta : tdee + delta;
  return Math.max(MIN_KCAL_FLOOR, target);
}

/**
 * Default macro split: 30% protein, 40% carb, 30% fat.
 * Returns grams (1g protein/carb = 4 kcal; 1g fat = 9 kcal).
 */
export function computeMacroSplit(daily_kcal: number): {
  protein_g: number;
  carb_g: number;
  fat_g: number;
} {
  return {
    protein_g: Math.round((daily_kcal * 0.30) / 4),
    carb_g: Math.round((daily_kcal * 0.40) / 4),
    fat_g: Math.round((daily_kcal * 0.30) / 9),
  };
}

/**
 * Estimate arrival date for a target weight given the pace's daily kcal delta.
 * Returns null if already at target.
 */
export function estimateArrivalDate(
  current_kg: number,
  target_kg: number,
  pace: Pace,
  from: Date = new Date(),
): Date | null {
  if (current_kg === target_kg) return null;
  const daily_delta = PACE_DELTA[pace];
  const days_needed =
    Math.abs(target_kg - current_kg) * KCAL_PER_KG_BODY_MASS / daily_delta;
  const arrival = new Date(from);
  arrival.setDate(arrival.getDate() + Math.round(days_needed));
  return arrival;
}
