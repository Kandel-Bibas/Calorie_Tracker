import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { buildAuthorizeUrl } from "@/lib/withings";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/withings/auth
 *
 * Initiates the Withings OAuth flow. Generates a CSRF state token, stashes
 * it in a short-lived HttpOnly cookie, and redirects to Withings's consent
 * page. The callback verifies the state matches before exchanging the code.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/login?next=%2Fsettings", "https://calorie-tracker-omega-dusky.vercel.app"),
    );
  }

  const state = randomUUID();
  const url = buildAuthorizeUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set("withings_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });
  return res;
}
