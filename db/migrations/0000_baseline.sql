CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"meal_id" uuid,
	"model" text NOT NULL,
	"call_kind" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "food_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_normalized" text NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"kcal_per_100g" numeric(6, 2) NOT NULL,
	"protein_per_100g" numeric(5, 2),
	"carb_per_100g" numeric(5, 2),
	"fat_per_100g" numeric(5, 2),
	"last_used_at" timestamp with time zone DEFAULT now(),
	"use_count" integer DEFAULT 1,
	CONSTRAINT "food_cache_query_normalized_unique" UNIQUE("query_normalized")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"intent" text,
	"target_weight_kg" numeric(5, 2),
	"pace" text,
	"daily_kcal" smallint NOT NULL,
	"protein_g" smallint,
	"carb_g" smallint,
	"fat_g" smallint,
	"activated_at" timestamp with time zone DEFAULT now(),
	"superseded_at" timestamp with time zone,
	CONSTRAINT "goals_intent_chk" CHECK ("goals"."intent" IN ('lose','maintain','gain','track')),
	CONSTRAINT "goals_pace_chk" CHECK ("goals"."pace" IN ('easy','steady','aggressive'))
);
--> statement-breakpoint
CREATE TABLE "meal_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"draft_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone DEFAULT now() + interval '90 minutes'
);
--> statement-breakpoint
CREATE TABLE "meal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"food_name" text NOT NULL,
	"display_name" text NOT NULL,
	"grams" numeric(7, 2) NOT NULL,
	"kcal" numeric(7, 2) NOT NULL,
	"protein_g" numeric(6, 2),
	"carb_g" numeric(6, 2),
	"fat_g" numeric(6, 2),
	"logging_mode" text,
	"user_provided_grams" boolean NOT NULL,
	"source" text,
	"source_ref" text,
	"match_confidence" numeric(3, 2),
	"user_edited" boolean DEFAULT false,
	CONSTRAINT "mi_mode_chk" CHECK ("meal_items"."logging_mode" IN ('component','composite','restaurant_estimate','saved_recipe')),
	CONSTRAINT "mi_source_chk" CHECK ("meal_items"."source" IN ('usda_foundation','usda_sr','usda_survey','usda_branded','open_food_facts','user_override','calorie_ninjas','fatsecret','gemini_estimate'))
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consumed_at" timestamp with time zone NOT NULL,
	"meal_type" text,
	"photo_path" text,
	"voice_transcript" text,
	"total_kcal" numeric(7, 2) NOT NULL,
	"total_protein_g" numeric(6, 2),
	"total_carb_g" numeric(6, 2),
	"total_fat_g" numeric(6, 2),
	"error_band_low" numeric(7, 2),
	"error_band_high" numeric(7, 2),
	"gemini_raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"edited_at" timestamp with time zone,
	CONSTRAINT "meals_mealtype_chk" CHECK ("meals"."meal_type" IN ('breakfast','lunch','dinner','snack'))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"sex" text,
	"birth_year" smallint,
	"height_cm" smallint,
	"units_weight" text DEFAULT 'lb',
	"units_height" text DEFAULT 'ft',
	"units_volume" text DEFAULT 'ml',
	"water_goal_ml" smallint DEFAULT 2000,
	"activity_level" text DEFAULT 'sedentary',
	"timezone" text DEFAULT 'America/Los_Angeles',
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "profiles_sex_chk" CHECK ("profiles"."sex" IN ('male','female','prefer_not')),
	CONSTRAINT "profiles_uw_chk" CHECK ("profiles"."units_weight" IN ('lb','kg')),
	CONSTRAINT "profiles_uh_chk" CHECK ("profiles"."units_height" IN ('ft','cm')),
	CONSTRAINT "profiles_uv_chk" CHECK ("profiles"."units_volume" IN ('ml','oz')),
	CONSTRAINT "profiles_al_chk" CHECK ("profiles"."activity_level" IN ('sedentary','light','moderate','active','very_active'))
);
--> statement-breakpoint
CREATE TABLE "streaks" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"current_length" smallint DEFAULT 0,
	"longest_length" smallint DEFAULT 0,
	"last_logged_date" date,
	"freeze_count" smallint DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "user_food_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"query_normalized" text NOT NULL,
	"display_name" text NOT NULL,
	"kcal_per_100g" numeric(6, 2) NOT NULL,
	"protein_per_100g" numeric(5, 2),
	"carb_per_100g" numeric(5, 2),
	"fat_per_100g" numeric(5, 2),
	"source" text,
	"source_ref" text,
	"recipe_ingredients" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"use_count" integer DEFAULT 1,
	CONSTRAINT "ufo_user_query_uniq" UNIQUE("user_id","query_normalized"),
	CONSTRAINT "ufo_source_chk" CHECK ("user_food_overrides"."source" IN ('label','manual','off_id','recipe'))
);
--> statement-breakpoint
CREATE TABLE "water_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"amount_ml" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recorded_on" date NOT NULL,
	"weight_kg" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "weights_user_day_uniq" UNIQUE("user_id","recorded_on")
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_drafts" ADD CONSTRAINT "meal_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_food_overrides" ADD CONSTRAINT "user_food_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weights" ADD CONSTRAINT "weights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_user_activated_idx" ON "goals" USING btree ("user_id","activated_at");--> statement-breakpoint
CREATE INDEX "mi_meal_idx" ON "meal_items" USING btree ("meal_id");--> statement-breakpoint
CREATE INDEX "meals_user_consumed_idx" ON "meals" USING btree ("user_id","consumed_at");--> statement-breakpoint
CREATE INDEX "water_user_logged_idx" ON "water_logs" USING btree ("user_id","logged_at");