import postgres from "postgres";
import { config } from "dotenv";
config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
async function main() {
  await sql`ALTER TABLE meal_items DROP CONSTRAINT IF EXISTS mi_source_chk`;
  await sql`ALTER TABLE meal_items ADD CONSTRAINT mi_source_chk CHECK (source IN ('usda_foundation','usda_sr','usda_survey','usda_branded','open_food_facts','user_override','calorie_ninjas','fatsecret','gemini_estimate'))`;
  console.log("✓ updated");
  await sql.end();
}
main().catch(async e => { console.error(e); await sql.end(); process.exit(1); });
