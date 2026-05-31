import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Request-scoped wrapper around `supabase.auth.getUser()`.
 *
 * Without `cache()`, every Server Component / Server Action that needs the
 * authenticated user makes its own call to Supabase (~80-150ms each). With
 * it, the result is deduped within a single request — the layout, the page,
 * and any Server Actions invoked during that render all share one fetch.
 *
 * Returns `null` if no user is signed in (callers decide whether to redirect).
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
