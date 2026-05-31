import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  const profiles = await sql`SELECT id, timezone FROM profiles`;
  console.log("Profile timezones:", profiles);

  const meals = await sql`
    SELECT id, meal_type, consumed_at, total_kcal,
           gemini_raw->>'meal_label' AS label
    FROM meals
    ORDER BY consumed_at DESC
    LIMIT 5
  `;
  console.log("\nRecent meals (consumed_at is UTC):");
  for (const m of meals) console.log(m);

  // Compute current "today" in CDT to compare
  console.log("\nServer time (UTC):", new Date().toISOString());

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
