import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Supabase magic-link / OAuth callback.
 *
 * Supabase appends `?code=...` to the redirect URL after the user clicks the
 * link in their email. We exchange that code for a session (cookies are set
 * via the SSR client) and forward to `?next` (default `/today`). If the code
 * is missing or exchange fails, bounce back to `/login?error=auth` so the
 * user can retry without seeing a 500.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/today";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
