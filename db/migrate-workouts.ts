import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS workouts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      source text NOT NULL CHECK (source IN ('withings','strava','fitbit','whoop','garmin','manual')),
      external_id text,
      started_at timestamptz NOT NULL,
      ended_at timestamptz,
      category smallint,
      category_label text,
      active_kcal integer,
      distance_m integer,
      duration_s integer,
      avg_hr smallint,
      max_hr smallint,
      raw jsonb,
      created_at timestamptz DEFAULT now(),
      UNIQUE (user_id, source, external_id)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS workouts_user_start_idx ON workouts (user_id, started_at DESC)`;
  console.log("✓ workouts table");

  await sql`ALTER TABLE workouts ENABLE ROW LEVEL SECURITY`;
  await sql`DROP POLICY IF EXISTS "users access own workouts" ON workouts`;
  await sql`
    CREATE POLICY "users access own workouts"
      ON workouts FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  `;
  console.log("✓ RLS");
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
