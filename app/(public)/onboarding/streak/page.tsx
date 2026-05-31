"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { saveOnboardingState } from "@/lib/onboarding-state";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/**
 * Step 6 — Streak commitment.
 *
 * Visual reinforcement that 7 consecutive days dramatically improves goal
 * adherence. We also capture the user's timezone here (while we're in the
 * browser) so streaks roll over at their local midnight, then forward to
 * first-meal.
 */
export default function OnboardingStreakPage() {
  const router = useRouter();
  const [tz, setTz] = React.useState<string>("America/Los_Angeles");

  React.useEffect(() => {
    // Capture the user's timezone now while we're in the browser. We use it
    // later in completeOnboarding so streaks roll over at local midnight.
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTz(detected);
    } catch {
      // ignore; default tz stays
    }
  }, []);

  function handleContinue() {
    saveOnboardingState({ timezone: tz });
    router.push("/onboarding/first-meal");
  }

  // Which day-of-week is "today"? Highlight it so the grid feels alive.
  const today = new Date().getDay(); // 0=Sun..6=Sat
  // Map JS Sunday-first index → our Monday-first column.
  const todayCol = (today + 6) % 7;

  return (
    <div className="flex flex-col h-full">
      <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--color-text-secondary)] mb-1">
        YOUR STREAK
      </p>
      <h1 className="text-2xl font-extrabold tracking-tight leading-[1.15]">
        Commit to 7 days.
      </h1>
      <p className="text-sm text-[var(--color-text-secondary)] mt-1 mb-5">
        People who log 7 days straight are 5× more likely to hit their goal.
      </p>

      <div className="grid grid-cols-7 gap-1.5 my-2">
        {DAY_LABELS.map((label, i) => {
          const isToday = i === todayCol;
          return (
            <div
              key={i}
              className={cn(
                "aspect-square rounded-xl flex items-center justify-center text-xs font-bold relative",
                isToday
                  ? "bg-[#FFF4E5] text-[#FF9500]"
                  : "bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)]",
              )}
            >
              {label}
              {isToday && (
                <span
                  className="absolute -top-1.5 -right-1.5 text-[12px]"
                  aria-hidden
                >
                  🔥
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-auto pt-8 flex flex-col gap-2">
        <Button
          size="lg"
          onClick={handleContinue}
          className="w-full h-13 rounded-2xl text-base bg-[var(--color-success-green)] text-white hover:bg-[var(--color-success-green)]/90"
        >
          I&apos;m in
        </Button>
      </div>
    </div>
  );
}
