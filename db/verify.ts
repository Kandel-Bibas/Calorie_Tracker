/**
 * Verify migrations applied: list tables and check RLS.
 */
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  const tables = await sql<{ tablename: string; rowsecurity: boolean }[]>`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `;
  console.log("PUBLIC TABLES:");
  for (const t of tables) {
    console.log(`  ${t.rowsecurity ? "🔒" : "🌍"}  ${t.tablename}`);
  }
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
