import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS integrations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      provider text NOT NULL CHECK (provider IN ('withings','strava','fitbit','whoop','garmin')),
      external_user_id text,
      access_token text NOT NULL,
      refresh_token text,
      expires_at timestamptz,
      scope text,
      last_synced_at timestamptz,
      created_at timestamptz DEFAULT now(),
      UNIQUE (user_id, provider)
    );
  `;
  console.log("✓ integrations");

  await sql`
    CREATE TABLE IF NOT EXISTS daily_activity (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      date date NOT NULL,
      source text NOT NULL CHECK (source IN ('withings','strava','fitbit','whoop','garmin','manual')),
      steps integer,
      active_kcal integer,
      total_kcal integer,
      distance_m integer,
      active_minutes integer,
      resting_hr smallint,
      raw jsonb,
      updated_at timestamptz DEFAULT now(),
      UNIQUE (user_id, date, source)
    );
  `;
  console.log("✓ daily_activity");

  // RLS
  await sql`ALTER TABLE integrations ENABLE ROW LEVEL SECURITY`;
  await sql`DROP POLICY IF EXISTS "users access own integrations" ON integrations`;
  await sql`
    CREATE POLICY "users access own integrations"
      ON integrations FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  `;
  await sql`ALTER TABLE daily_activity ENABLE ROW LEVEL SECURITY`;
  await sql`DROP POLICY IF EXISTS "users access own activity" ON daily_activity`;
  await sql`
    CREATE POLICY "users access own activity"
      ON daily_activity FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  `;
  console.log("✓ RLS policies");

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
