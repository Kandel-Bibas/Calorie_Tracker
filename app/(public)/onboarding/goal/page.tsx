"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  TrendingDown,
  Scale,
  TrendingUp,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  loadOnboardingState,
  saveOnboardingState,
  type OnboardingState,
} from "@/lib/onboarding-state";

type Intent = NonNullable<OnboardingState["intent"]>;

interface Option {
  intent: Intent;
  label: string;
  icon: LucideIcon;
}

const OPTIONS: ReadonlyArray<Option> = [
  { intent: "lose", label: "Lose weight", icon: TrendingDown },
  { intent: "maintain", label: "Maintain weight", icon: Scale },
  { intent: "gain", label: "Gain weight / muscle", icon: TrendingUp },
  { intent: "track", label: "Just track", icon: BarChart3 },
] as const;

/**
 * Step 2 — Goal selection.
 *
 * Four large tap-targets with Lucide icons. Selecting writes `{ intent }` to
 * onboarding state immediately so the user can back-button without losing
 * their choice; `Continue` simply routes forward.
 */
export default function OnboardingGoalPage() {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Intent | undefined>(undefined);

  // Hydrate from existing state on mount.
  React.useEffect(() => {
    const state = loadOnboardingState();
    if (state.intent) setSelected(state.intent);
  }, []);

  function select(intent: Intent) {
    setSelected(intent);
    saveOnboardingState({ intent });
  }

  function handleContinue() {
    if (!selected) return;
    saveOnboardingState({ intent: selected });
    router.push("/onboarding/about");
  }

  return (
    <div className="flex flex-col h-full">
      <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--color-text-secondary)] mb-1">
        YOUR GOAL
      </p>
      <h1 className="text-2xl font-extrabold tracking-tight leading-[1.15]">
        What brings you here?
      </h1>
      <p className="text-sm text-[var(--color-text-secondary)] mt-1 mb-6">
        We&apos;ll tailor your daily target.
      </p>

      <div className="flex flex-col gap-2.5">
        {OPTIONS.map(({ intent, label, icon: Icon }) => {
          const isSelected = selected === intent;
          return (
            <button
              key={intent}
              type="button"
              onClick={() => select(intent)}
              aria-pressed={isSelected}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left font-semibold text-sm transition-colors duration-150",
                isSelected
                  ? "bg-[var(--color-text-primary)] text-white"
                  : "bg-[var(--color-surface-muted)] text-[var(--color-text-primary)]",
              )}
            >
              <span
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                  isSelected
                    ? "bg-white/15 text-white"
                    : "bg-white text-[var(--color-text-primary)]",
                )}
              >
                <Icon className="w-4 h-4" />
              </span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto pt-8">
        <Button
          size="lg"
          className="w-full h-13 rounded-2xl text-base"
          disabled={!selected}
          onClick={handleContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
