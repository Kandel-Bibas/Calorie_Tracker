import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getCachedProfile, getCachedStreak } from "@/lib/cached";
import { userToday } from "@/lib/dates";
import { TabBar } from "@/components/tab-bar";
import { OnboardingClaim } from "@/components/onboarding-claim/onboarding-claim";
import { ThemeToggle } from "@/components/theme-toggle/theme-toggle";

// No `force-dynamic` — let Next.js Router Cache reuse the RSC payload between
// tab visits. Authenticated content stays correct because `getCurrentUser` is
// re-validated per request via cookies, and the cached layout data is keyed
// to the user's ID with explicit revalidation on mutating actions.

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Authenticated app shell. Server-renders the top bar (streak + date)
 * and the bottom tab bar / desktop left rail. Redirects to /login if
 * no user session is present.
 */
export default async function AppLayout({ children }: AppLayoutProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [streakRow, profileRow] = await Promise.all([
    getCachedStreak(user.id),
    getCachedProfile(user.id),
  ]);

  const tz = profileRow?.timezone ?? "America/Los_Angeles";
  const todayIso = userToday(tz);
  const streakLength = streakRow?.current_length ?? 0;

  const todayLabel = new Date(todayIso + "T00:00:00").toLocaleDateString(
    undefined,
    { weekday: "long", month: "short", day: "numeric" },
  );

  return (
    <>
      <div className="min-h-screen bg-[var(--color-surface-muted)] lg:pl-20">
        <header
          className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-surface-border)] bg-[var(--color-surface)]/95 px-4 py-3 backdrop-blur lg:px-8"
          aria-label="App header"
        >
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)]">
              {todayLabel}
            </span>
            <span className="text-base font-semibold text-[var(--color-text-primary)]">
              {profileRow?.display_name ? `Hi, ${profileRow.display_name}` : "Welcome"}
            </span>
          </div>
          <ThemeToggle streakLength={streakLength} />
        </header>

        <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 lg:pb-12 lg:pt-8">
          {children}
        </main>
      </div>
      <TabBar />
      {/* Apply any localStorage onboarding draft to the DB on first load. */}
      <OnboardingClaim userId={user.id} />
    </>
  );
}
