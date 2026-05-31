/**
 * One-off: delete `food_cache` rows whose source starts with `usda_`.
 *
 * The cache holds the resolution from a prior pipeline that prioritized
 * USDA. Now that USDA is retired, we want subsequent lookups for those
 * queries to flow through the new tiers (FatSecret → Gemini → OFF) and
 * pick up correct source tags.
 */
import postgres from "postgres";
import { config } from "dotenv";
import { like } from "drizzle-orm";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  const before = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM food_cache WHERE source LIKE 'usda_%'
  `;
  console.log(`USDA cache rows before: ${before[0]?.count ?? 0}`);

  const result = await sql<{ count: number }[]>`
    DELETE FROM food_cache WHERE source LIKE 'usda_%' RETURNING 1
  `;
  console.log(`Deleted: ${result.length}`);

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
