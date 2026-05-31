/**
 * Generate a Supabase magic link via the admin API, bypassing email + rate limits.
 *
 * Usage:
 *   pnpm tsx scripts/magic-link.ts you@example.com
 *   pnpm tsx scripts/magic-link.ts you@example.com /log    # custom 'next' path
 *
 * Prints a single URL — open it on the device you want to sign in on.
 * The link is single-use and expires in ~60 minutes.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL =
  process.env.PROD_URL ?? "https://calorie-tracker-omega-dusky.vercel.app";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const email = process.argv[2];
const nextPath = process.argv[3] ?? "/today";

if (!email) {
  console.error("Usage: pnpm tsx scripts/magic-link.ts you@example.com [/next-path]");
  process.exit(1);
}

const redirectTo = `${PROD_URL}/auth/callback?next=${encodeURIComponent(nextPath)}`;

const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SERVICE_ROLE}`,
    apikey: SERVICE_ROLE,
  },
  body: JSON.stringify({
    type: "magiclink",
    email,
    options: { redirect_to: redirectTo },
  }),
});

if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const data = (await res.json()) as {
  properties?: { action_link?: string; hashed_token?: string };
  user?: { id?: string; email?: string };
  action_link?: string;
};

const link = data.action_link ?? data.properties?.action_link;

if (!link) {
  console.error("No action_link in response:", JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log("\n  Magic link ready:\n");
console.log(`    ${link}\n`);
console.log(`  User: ${data.user?.email ?? email}`);
console.log(`  Next: ${nextPath}`);
console.log(`  Expires: ~60 minutes from now\n`);
