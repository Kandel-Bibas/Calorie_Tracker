"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spark } from "@/components/spark";
import {
  applyPaceAdjustment,
  computeMacroSplit,
  estimateArrivalDate,
  mifflinStJeor,
} from "@/lib/goals";
import {
  loadOnboardingState,
  saveOnboardingState,
  type OnboardingState,
} from "@/lib/onboarding-state";

const CURRENT_YEAR = new Date().getFullYear();

interface ComputedPlan {
  daily_kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  arrival: Date | null;
}

/**
 * Compute the user's plan from the captured state. Returns null if any field
 * required by Mifflin-St Jeor is missing — caller should redirect back.
 */
function computePlan(state: OnboardingState): ComputedPlan | null {
  if (
    !state.sex ||
    !state.birth_year ||
    !state.height_cm ||
    !state.current_weight_kg ||
    !state.intent
  ) {
    return null;
  }
  const age = CURRENT_YEAR - state.birth_year;
  const tdee = mifflinStJeor({
    sex: state.sex,
    age,
    height_cm: state.height_cm,
    weight_kg: state.current_weight_kg,
  });
  const pace = state.pace ?? "steady";
  const daily = applyPaceAdjustment(tdee, state.intent, pace);
  const macros = computeMacroSplit(daily);
  const arrival =
    state.target_weight_kg != null
      ? estimateArrivalDate(state.current_weight_kg, state.target_weight_kg, pace)
      : null;
  return {
    daily_kcal: daily,
    protein_g: macros.protein_g,
    carb_g: macros.carb_g,
    fat_g: macros.fat_g,
    arrival,
  };
}

/**
 * Trigger a subtle confetti burst from the top-centre of the viewport.
 * Safe no-op in non-browser environments because we only call this from an
 * effect.
 */
function fireConfetti() {
  const palette = ["#FF6B35", "#FFB627", "#34C759", "#007AFF", "#FF3B30"];
  confetti({
    particleCount: 70,
    spread: 70,
    startVelocity: 35,
    origin: { x: 0.5, y: 0.25 },
    colors: palette,
    scalar: 0.9,
    ticks: 180,
    disableForReducedMotion: true,
  });
}

/**
 * Step 5 — Plan reveal.
 *
 * Computes Mifflin-St Jeor → pace adjustment → macro split, displays the
 * result, and fires a small confetti burst on mount. The user can tap the
 * big kcal number to inline-edit it (saved as `daily_kcal` override).
 */
export default function OnboardingPlanPage() {
  const router = useRouter();
  const [state, setState] = React.useState<OnboardingState | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState<string>("");

  React.useEffect(() => {
    setState(loadOnboardingState());
  }, []);

  // Fire confetti when the plan is first painted.
  const planFiredRef = React.useRef(false);
  React.useEffect(() => {
    if (!state || planFiredRef.current) return;
    planFiredRef.current = true;
    // Small delay so the screen has settled into place before particles fly.
    const t = window.setTimeout(fireConfetti, 200);
    return () => window.clearTimeout(t);
  }, [state]);

  if (!state) {
    return <div className="flex-1" aria-hidden />;
  }

  const computed = computePlan(state);
  if (!computed) {
    // Missing inputs — redirect back to step 2. Pushed from an effect to avoid
    // setState-during-render warnings.
    return (
      <MissingDataRedirect onRedirect={() => router.replace("/onboarding/goal")} />
    );
  }

  const displayedKcal = state.daily_kcal ?? computed.daily_kcal;

  // If the user has overridden kcal, recompute macros from the override.
  const macros = state.daily_kcal
    ? computeMacroSplit(state.daily_kcal)
    : {
        protein_g: computed.protein_g,
        carb_g: computed.carb_g,
        fat_g: computed.fat_g,
      };

  function commitEdit() {
    const n = Number(editValue);
    if (Number.isFinite(n) && n >= 800 && n <= 6000) {
      saveOnboardingState({ daily_kcal: Math.round(n) });
      setState((prev) => (prev ? { ...prev, daily_kcal: Math.round(n) } : prev));
    }
    setEditing(false);
  }

  function startEdit() {
    setEditValue(String(displayedKcal));
    setEditing(true);
  }

  function handleContinue() {
    // Ensure the chosen kcal is persisted (in case the user never edited).
    if (state && state.daily_kcal == null && computed) {
      saveOnboardingState({ daily_kcal: computed.daily_kcal });
    }
    router.push("/onboarding/streak");
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Subtle celebratory dot pattern behind the content */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 20% 20%, #FF3B30 2px, transparent 3px),
            radial-gradient(circle at 80% 30%, #34C759 2px, transparent 3px),
            radial-gradient(circle at 30% 70%, #007AFF 2px, transparent 3px),
            radial-gradient(circle at 70% 80%, #FF9500 2px, transparent 3px)`,
          backgroundSize: "80px 80px",
        }}
      />

      <div className="relative flex flex-col h-full">
        <div className="flex justify-center mb-2">
          <Spark variant="wobble" size={72} />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-center leading-[1.15]">
          Your daily plan is ready.
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] text-center mt-1 mb-4">
          Mifflin-St Jeor + {state.pace ?? "steady"} pace.
        </p>

        <div className="my-2 flex flex-col items-center">
          {editing ? (
            <Input
              autoFocus
              type="number"
              inputMode="numeric"
              min={800}
              max={6000}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                else if (e.key === "Escape") setEditing(false);
              }}
              className="w-40 text-center text-5xl font-extralight h-16 tracking-tight"
              aria-label="Daily kcal target"
            />
          ) : (
            <button
              type="button"
              onClick={startEdit}
              aria-label="Edit daily kcal target"
              className="text-[64px] font-extralight leading-none tracking-[-2.5px] text-[var(--color-text-primary)]"
            >
              {displayedKcal.toLocaleString()}
            </button>
          )}
          <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--color-text-secondary)] mt-2">
            KCAL PER DAY
          </p>
          {!editing && (
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
              Tap the number to edit
            </p>
          )}
        </div>

        <div className="mt-4">
          <StatRow label="Protein" value={`${macros.protein_g}g`} first />
          <StatRow label="Carbs" value={`${macros.carb_g}g`} />
          <StatRow label="Fat" value={`${macros.fat_g}g`} />
          {computed.arrival && (
            <StatRow
              label="Est. target by"
              value={formatShortDate(computed.arrival)}
            />
          )}
        </div>

        <div className="mt-auto pt-8">
          <Button
            size="lg"
            className="w-full h-13 rounded-2xl text-base"
            onClick={handleContinue}
          >
            Looks good
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  first,
}: {
  label: string;
  value: string;
  first?: boolean;
}) {
  return (
    <div
      className={`flex justify-between py-2 text-sm ${
        first ? "" : "border-t border-[var(--color-surface-muted)]"
      }`}
    >
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <span className="font-bold text-[var(--color-text-primary)]">
        {value}
      </span>
    </div>
  );
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function MissingDataRedirect({ onRedirect }: { onRedirect: () => void }) {
  React.useEffect(() => {
    onRedirect();
  }, [onRedirect]);
  return <div className="flex-1" aria-hidden />;
}
