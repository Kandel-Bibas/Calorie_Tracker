import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeAndStore } from "@/lib/withings";

/**
 * Withings OAuth 2.0 callback.
 *
 * If called with `?code=...&state=...`, this is Withings completing the
 * consent flow. We verify state, exchange the code for tokens, and save.
 *
 * If called with no params, it's the reachability test from the Withings
 * developer dashboard — respond 200 so the dashboard's test passes.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Reachability probe.
  if (!code && !error && !state) {
    return new NextResponse("Withings callback endpoint ready.", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (error) {
    return NextResponse.redirect(
      new URL("/settings?withings_error=" + encodeURIComponent(error), request.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings?withings_error=missing_params", request.url));
  }

  // Verify CSRF state.
  const jar = await cookies();
  const expected = jar.get("withings_oauth_state")?.value;
  if (!expected || expected !== state) {
    return NextResponse.redirect(new URL("/settings?withings_error=state_mismatch", request.url));
  }
  jar.delete("withings_oauth_state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/login?next=%2Fsettings%3Fwithings_pending%3D1", request.url),
    );
  }

  try {
    await exchangeCodeAndStore({ userId: user.id, code });
  } catch (err) {
    const m = err instanceof Error ? err.message : "exchange failed";
    return NextResponse.redirect(
      new URL("/settings?withings_error=" + encodeURIComponent(m), request.url),
    );
  }

  return NextResponse.redirect(new URL("/settings?withings=connected", request.url));
}
