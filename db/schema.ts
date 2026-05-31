import {
  pgTable,
  uuid,
  text,
  smallint,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  check,
  unique,
  index,
  pgSchema,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// auth.users is managed by Supabase Auth
const authSchema = pgSchema("auth");
const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

// ----- profiles -----
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  display_name: text("display_name"),
  sex: text("sex"),
  birth_year: smallint("birth_year"),
  height_cm: smallint("height_cm"),
  units_weight: text("units_weight").default("lb"),
  units_height: text("units_height").default("ft"),
  units_volume: text("units_volume").default("ml"),
  water_goal_ml: smallint("water_goal_ml").default(2000),
  activity_level: text("activity_level").default("sedentary"),
  timezone: text("timezone").default("America/Los_Angeles"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  sexCheck: check("profiles_sex_chk", sql`${t.sex} IN ('male','female','prefer_not')`),
  uwCheck: check("profiles_uw_chk", sql`${t.units_weight} IN ('lb','kg')`),
  uhCheck: check("profiles_uh_chk", sql`${t.units_height} IN ('ft','cm')`),
  uvCheck: check("profiles_uv_chk", sql`${t.units_volume} IN ('ml','oz')`),
  alCheck: check("profiles_al_chk", sql`${t.activity_level} IN ('sedentary','light','moderate','active','very_active')`),
}));

// ----- goals (versioned) -----
export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  intent: text("intent"),
  target_weight_kg: numeric("target_weight_kg", { precision: 5, scale: 2 }),
  pace: text("pace"),
  daily_kcal: smallint("daily_kcal").notNull(),
  protein_g: smallint("protein_g"),
  carb_g: smallint("carb_g"),
  fat_g: smallint("fat_g"),
  activated_at: timestamp("activated_at", { withTimezone: true }).defaultNow(),
  superseded_at: timestamp("superseded_at", { withTimezone: true }),
}, (t) => ({
  intentCheck: check("goals_intent_chk", sql`${t.intent} IN ('lose','maintain','gain','track')`),
  paceCheck: check("goals_pace_chk", sql`${t.pace} IN ('easy','steady','aggressive')`),
  byUserActivated: index("goals_user_activated_idx").on(t.user_id, t.activated_at),
}));

// ----- meals -----
export const meals = pgTable("meals", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  consumed_at: timestamp("consumed_at", { withTimezone: true }).notNull(),
  meal_type: text("meal_type"),
  photo_path: text("photo_path"),
  voice_transcript: text("voice_transcript"),
  total_kcal: numeric("total_kcal", { precision: 7, scale: 2 }).notNull(),
  total_protein_g: numeric("total_protein_g", { precision: 6, scale: 2 }),
  total_carb_g: numeric("total_carb_g", { precision: 6, scale: 2 }),
  total_fat_g: numeric("total_fat_g", { precision: 6, scale: 2 }),
  error_band_low: numeric("error_band_low", { precision: 7, scale: 2 }),
  error_band_high: numeric("error_band_high", { precision: 7, scale: 2 }),
  gemini_raw: jsonb("gemini_raw"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  edited_at: timestamp("edited_at", { withTimezone: true }),
}, (t) => ({
  mealTypeCheck: check("meals_mealtype_chk", sql`${t.meal_type} IN ('breakfast','lunch','dinner','snack')`),
  byUserConsumed: index("meals_user_consumed_idx").on(t.user_id, t.consumed_at),
}));

// ----- meal_items -----
export const mealItems = pgTable("meal_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  meal_id: uuid("meal_id").notNull().references(() => meals.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull(),
  food_name: text("food_name").notNull(),
  display_name: text("display_name").notNull(),
  grams: numeric("grams", { precision: 7, scale: 2 }).notNull(),
  kcal: numeric("kcal", { precision: 7, scale: 2 }).notNull(),
  protein_g: numeric("protein_g", { precision: 6, scale: 2 }),
  carb_g: numeric("carb_g", { precision: 6, scale: 2 }),
  fat_g: numeric("fat_g", { precision: 6, scale: 2 }),
  logging_mode: text("logging_mode"),
  user_provided_grams: boolean("user_provided_grams").notNull(),
  source: text("source"),
  source_ref: text("source_ref"),
  match_confidence: numeric("match_confidence", { precision: 3, scale: 2 }),
  user_edited: boolean("user_edited").default(false),
}, (t) => ({
  modeCheck: check("mi_mode_chk", sql`${t.logging_mode} IN ('component','composite','restaurant_estimate','saved_recipe')`),
  sourceCheck: check("mi_source_chk", sql`${t.source} IN ('usda_foundation','usda_sr','usda_survey','usda_branded','open_food_facts','user_override','calorie_ninjas','fatsecret','gemini_estimate')`),
  byMeal: index("mi_meal_idx").on(t.meal_id),
}));

// ----- weights -----
export const weights = pgTable("weights", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  recorded_on: date("recorded_on").notNull(),
  weight_kg: numeric("weight_kg", { precision: 5, scale: 2 }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  oneRowPerDay: unique("weights_user_day_uniq").on(t.user_id, t.recorded_on),
}));

// ----- water_logs (one row per drink event; daily total via tz day-range) -----
export const waterLogs = pgTable("water_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  logged_at: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  amount_ml: integer("amount_ml").notNull(),
}, (t) => ({
  byUserLogged: index("water_user_logged_idx").on(t.user_id, t.logged_at),
}));

// ----- streaks -----
export const streaks = pgTable("streaks", {
  user_id: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  current_length: smallint("current_length").default(0),
  longest_length: smallint("longest_length").default(0),
  last_logged_date: date("last_logged_date"),
  freeze_count: smallint("freeze_count").default(0),
});

// ----- food_cache (GLOBAL — no user_id) -----
export const foodCache = pgTable("food_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  query_normalized: text("query_normalized").notNull().unique(),
  source: text("source").notNull(),
  source_ref: text("source_ref").notNull(),
  kcal_per_100g: numeric("kcal_per_100g", { precision: 6, scale: 2 }).notNull(),
  protein_per_100g: numeric("protein_per_100g", { precision: 5, scale: 2 }),
  carb_per_100g: numeric("carb_per_100g", { precision: 5, scale: 2 }),
  fat_per_100g: numeric("fat_per_100g", { precision: 5, scale: 2 }),
  last_used_at: timestamp("last_used_at", { withTimezone: true }).defaultNow(),
  use_count: integer("use_count").default(1),
});

// ----- user_food_overrides (per-user) -----
export const userFoodOverrides = pgTable("user_food_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  query_normalized: text("query_normalized").notNull(),
  display_name: text("display_name").notNull(),
  kcal_per_100g: numeric("kcal_per_100g", { precision: 6, scale: 2 }).notNull(),
  protein_per_100g: numeric("protein_per_100g", { precision: 5, scale: 2 }),
  carb_per_100g: numeric("carb_per_100g", { precision: 5, scale: 2 }),
  fat_per_100g: numeric("fat_per_100g", { precision: 5, scale: 2 }),
  source: text("source"),
  source_ref: text("source_ref"),
  recipe_ingredients: jsonb("recipe_ingredients"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  use_count: integer("use_count").default(1),
}, (t) => ({
  sourceCheck: check("ufo_source_chk", sql`${t.source} IN ('label','manual','off_id','recipe')`),
  uniq: unique("ufo_user_query_uniq").on(t.user_id, t.query_normalized),
}));

// ----- meal_drafts (short-lived) -----
export const mealDrafts = pgTable("meal_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  draft_data: jsonb("draft_data").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  expires_at: timestamp("expires_at", { withTimezone: true }).default(sql`now() + interval '90 minutes'`),
});

// ----- ai_calls (observability) -----
export const aiCalls = pgTable("ai_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").references(() => authUsers.id, { onDelete: "set null" }),
  meal_id: uuid("meal_id").references(() => meals.id, { onDelete: "set null" }),
  model: text("model").notNull(),
  call_kind: text("call_kind").notNull(),
  input_tokens: integer("input_tokens"),
  output_tokens: integer("output_tokens"),
  latency_ms: integer("latency_ms"),
  error: text("error"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Convenience exports of inferred types
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Meal = typeof meals.$inferSelect;
export type NewMeal = typeof meals.$inferInsert;
export type MealItem = typeof mealItems.$inferSelect;
export type NewMealItem = typeof mealItems.$inferInsert;
export type GoalRow = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type Weight = typeof weights.$inferSelect;
export type WaterLog = typeof waterLogs.$inferSelect;
export type NewWaterLog = typeof waterLogs.$inferInsert;
export type Streak = typeof streaks.$inferSelect;
export type FoodCacheRow = typeof foodCache.$inferSelect;
export type UserFoodOverride = typeof userFoodOverrides.$inferSelect;
export type MealDraft = typeof mealDrafts.$inferSelect;
export type AiCall = typeof aiCalls.$inferSelect;
