/**
 * Hit Withings APIs directly with the user's stored token to see what
 * comes back. Helps diagnose why activity/workouts are empty even after
 * a sync.
 */
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const API_BASE = "https://wbsapi.withings.net";

async function call(token: string, path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, http: res.status };
  }
}

async function main() {
  const [row] = await sql<
    { access_token: string; external_user_id: string }[]
  >`SELECT access_token, external_user_id FROM integrations WHERE provider='withings' LIMIT 1`;
  if (!row) {
    console.log("No Withings integration in DB");
    await sql.end();
    return;
  }
  const token = row.access_token;
  console.log(`Token: ${token.slice(0, 20)}... user ${row.external_user_id}`);

  // 1. List devices the user has linked
  console.log("\n=== getdevice (linked devices?) ===");
  console.log(JSON.stringify(await call(token, "/v2/user", { action: "getdevice" }), null, 2));

  // 2. Activity for last 7 days (no field filter)
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  console.log("\n=== getactivity 7 days ===");
  console.log(JSON.stringify(await call(token, "/v2/measure", {
    action: "getactivity",
    startdateymd: fmt(weekAgo),
    enddateymd: fmt(today),
  }), null, 2));

  console.log("\n=== getworkouts 7 days ===");
  console.log(JSON.stringify(await call(token, "/v2/measure", {
    action: "getworkouts",
    startdateymd: fmt(weekAgo),
    enddateymd: fmt(today),
  }), null, 2));

  console.log("\n=== getmeas (all measurements, last 7d) ===");
  const startTs = Math.floor(weekAgo.getTime() / 1000);
  const endTs = Math.floor(today.getTime() / 1000);
  const meas = await call(token, "/measure", {
    action: "getmeas",
    startdate: String(startTs),
    enddate: String(endTs),
  }) as { body?: { measuregrps?: Array<{ date: number; measures?: Array<{ type: number; value: number; unit: number }> }> } };
  // Just count by measure type to keep output manageable
  if (meas.body?.measuregrps) {
    const typeCount: Record<number, number> = {};
    for (const g of meas.body.measuregrps) {
      for (const m of g.measures ?? []) {
        typeCount[m.type] = (typeCount[m.type] ?? 0) + 1;
      }
    }
    console.log("Measure type counts:", typeCount);
    console.log("Withings measure types: 1=Weight, 4=Height, 5=Fat-Free, 6=Fat ratio, 8=Fat mass, 11=Heart rate, 12=Temp, 76=Muscle, 77=Water, 88=Bone");
  } else {
    console.log(meas);
  }

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
