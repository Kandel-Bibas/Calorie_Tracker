import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  console.log("=== integrations ===");
  const ints = await sql`SELECT user_id, provider, external_user_id, last_synced_at, expires_at FROM integrations`;
  for (const r of ints) console.log(r);

  console.log("\n=== daily_activity (last 7 rows) ===");
  const acts = await sql`SELECT user_id, date, source, steps, active_kcal, total_kcal, active_minutes FROM daily_activity ORDER BY date DESC LIMIT 7`;
  if (acts.length === 0) console.log("(empty)");
  for (const r of acts) console.log(r);

  console.log("\n=== workouts (last 10) ===");
  const wks = await sql`SELECT user_id, category_label, started_at, ended_at, active_kcal, distance_m, duration_s FROM workouts ORDER BY started_at DESC LIMIT 10`;
  if (wks.length === 0) console.log("(empty)");
  for (const r of wks) console.log(r);

  console.log("\n=== weights (last 5) ===");
  const wts = await sql`SELECT user_id, recorded_on, weight_kg FROM weights ORDER BY recorded_on DESC LIMIT 5`;
  if (wts.length === 0) console.log("(empty)");
  for (const r of wts) console.log(r);

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
