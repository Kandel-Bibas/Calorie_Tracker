import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const connectionString = process.env.DATABASE_URL;

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required. Set it in .env.local or your deployment environment.",
    );
  }
  if (!_db) {
    const client = postgres(connectionString, { prepare: false });
    _db = drizzle(client, { schema });
  }
  return _db;
}

// Default export for convenience (lazy)
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_t, prop) {
    return Reflect.get(getDb() as object, prop);
  },
});
