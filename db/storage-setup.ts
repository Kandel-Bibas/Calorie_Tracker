/**
 * Create the 'meals' Storage bucket if it doesn't exist.
 * Storage buckets live in Supabase's storage schema and can be created via SQL.
 */
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  await sql`
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('meals', 'meals', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
    ON CONFLICT (id) DO UPDATE SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  `;
  console.log("✓ meals bucket ready");

  const buckets = await sql<{ id: string; name: string; public: boolean }[]>`
    SELECT id, name, public FROM storage.buckets;
  `;
  console.log("BUCKETS:");
  for (const b of buckets) console.log(`  ${b.public ? "🌍" : "🔒"}  ${b.name}`);

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
