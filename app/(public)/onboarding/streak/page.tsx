"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { saveOnboardingState, loadOnboardingState } from "@/lib/onboarding-state";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/**
 * Step 6 — Streak commitment.
 *
 * Visual reinforcement that 7 consecutive days dramatically improves goal
 * adherence. We capture an optional reminder time (default 8:00 PM); user can
 * either commit ("I'm in") or opt out ("No reminders, thanks"). Either route
 * forwards to first-meal — reminders are persisted as a `reminder_time` HH:MM
 * string, or `null` if skipped.
 */
export default function OnboardingStreakPage() {
  const router = useRouter();
  const [time, setTime] = React.useState<string>("20:00");
  const [tz, setTz] = React.useState<string>("America/Los_Angeles");

  React.useEffect(() => {
    const state = loadOnboardingState();
    if (state.reminder_time) setTime(state.reminder_time);
    // Capture the user's timezone now while we're in the browser. We use it
    // later in completeOnboarding so streaks roll over at local midnight.
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTz(detected);
    } catch {
      // ignore; default tz stays
    }
  }, []);

  function handleCommit() {
    saveOnboardingState({ reminder_time: time, timezone: tz });
    router.push("/onboarding/first-meal");
  }

  function handleSkip() {
    saveOnboardingState({ reminder_time: null, timezone: tz });
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
        We&apos;ll nudge you each evening.
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

      <p className="text-[10px] font-semibold tracking-[0.12em] text-[var(--color-text-secondary)] mt-5 mb-1.5">
        REMINDER TIME
      </p>
      <Input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        aria-label="Daily reminder time"
        className="bg-[var(--color-surface-muted)] border-transparent text-lg font-semibold h-12"
      />

      <div className="mt-auto pt-8 flex flex-col gap-2">
        <Button
          size="lg"
          onClick={handleCommit}
          className="w-full h-13 rounded-2xl text-base bg-[var(--color-success-green)] text-white hover:bg-[var(--color-success-green)]/90"
        >
          I&apos;m in
        </Button>
        <button
          type="button"
          onClick={handleSkip}
          className="text-center text-sm font-medium text-[var(--color-text-secondary)] py-2"
        >
          No reminders, thanks
        </button>
      </div>
    </div>
  );
}
