/**
 * One-shot script to apply the generated Drizzle migration + RLS policies
 * directly against a Supabase Postgres instance.
 *
 * Bypasses drizzle-kit push's interactive prompts.
 *
 * Usage: `pnpm tsx db/apply.ts`
 */
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required (set in .env.local)");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

async function main() {
  // 1) Apply migration files in order.
  const migDir = join(process.cwd(), "db/migrations");
  const migrations = readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of migrations) {
    console.log(`Applying migration: ${file}`);
    const sqlText = readFileSync(join(migDir, file), "utf8");
    // Drizzle migrations use `--> statement-breakpoint` to separate statements
    const statements = sqlText
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      try {
        await sql.unsafe(stmt);
      } catch (err) {
        // Idempotency: ignore "already exists" errors
        const msg = (err as { message?: string }).message ?? "";
        if (/already exists/i.test(msg)) {
          console.log(`  · skipped: ${msg.split("\n")[0]}`);
          continue;
        }
        throw err;
      }
    }
    console.log(`  ✓ ${file}`);
  }

  // 2) Apply RLS + storage policies.
  console.log("Applying RLS + storage policies (db/policies.sql)");
  const policySql = readFileSync(join(process.cwd(), "db/policies.sql"), "utf8");
  // policies.sql may reference storage.objects which only exists in Supabase
  // (not on bare Postgres). We split on bare semicolons.
  const policyStatements = policySql
    .split(/;\s*\n/)
    .map((stmt) => {
      // Strip leading comment-only lines so the SQL is the first thing
      return stmt
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim();
    })
    .filter(Boolean);
  for (const stmt of policyStatements) {
    try {
      await sql.unsafe(stmt);
    } catch (err) {
      const msg = (err as { message?: string }).message ?? "";
      if (/already exists|does not exist|relation "storage\.objects"/.test(msg)) {
        console.log(`  · note: ${msg.split("\n")[0]}`);
        continue;
      }
      throw err;
    }
  }
  console.log("  ✓ policies applied");

  await sql.end();
  console.log("\nDone.");
}

main().catch(async (err) => {
  console.error("FAILED:", err);
  await sql.end({ timeout: 1 });
  process.exit(1);
});
