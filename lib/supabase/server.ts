import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Supabase SSR client for use in:
 *   - React Server Components
 *   - Server Actions
 *   - Route Handlers
 *
 * Reads + writes auth cookies via next/headers cookies().
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll can fail in Server Components when called from a layout/page render.
            // Middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Resolve the authenticated user for a route handler, supporting two clients:
 *   1. Browser (web app) — session carried in auth cookies (tried first).
 *   2. Native app — Supabase access token in an `Authorization: Bearer <jwt>`
 *      header. The JWT is validated server-side via `getUser(token)` (a network
 *      call to Supabase Auth), not merely decoded.
 *
 * Returns the user, or null when neither path authenticates. Additive: the
 * existing cookie flow is unchanged, so web behavior is unaffected.
 */
export async function getRequestUser(request: Request) {
  const supabase = await createClient();

  // 1. Cookie-based session (web).
  const {
    data: { user: cookieUser },
  } = await supabase.auth.getUser();
  if (cookieUser) return cookieUser;

  // 2. Bearer token (native clients).
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const {
    data: { user: tokenUser },
  } = await supabase.auth.getUser(token);
  return tokenUser ?? null;
}

/**
 * Service-role client. ONLY for trusted server-side use — bypasses RLS.
 * Use sparingly (cache writes, admin operations).
 */
export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
    },
  );
}
