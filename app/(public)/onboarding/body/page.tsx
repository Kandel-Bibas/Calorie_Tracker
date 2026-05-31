"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  kgToLb,
  lbToKg,
  loadOnboardingState,
  saveOnboardingState,
  type OnboardingState,
} from "@/lib/onboarding-state";

type Pace = NonNullable<OnboardingState["pace"]>;
type WeightUnit = NonNullable<OnboardingState["units_weight"]>;

const PACE_OPTIONS: ReadonlyArray<{ value: Pace; label: string }> = [
  { value: "easy", label: "Easy" },
  { value: "steady", label: "Steady" },
  { value: "aggressive", label: "Aggressive" },
];

/**
 * Step 4 — Body: current weight, target weight, pace.
 *
 * Inputs display in the user's preferred unit (lb default, toggle to kg) but
 * internally we always persist kilograms. Pace is required to compute the
 * daily kcal delta on the next screen.
 */
export default function OnboardingBodyPage() {
  const router = useRouter();

  const [unit, setUnit] = React.useState<WeightUnit>("lb");
  const [currentInput, setCurrentInput] = React.useState<string>("");
  const [targetInput, setTargetInput] = React.useState<string>("");
  const [pace, setPace] = React.useState<Pace | undefined>("steady");
  const [intent, setIntent] = React.useState<OnboardingState["intent"]>();

  // Hydrate.
  React.useEffect(() => {
    const state = loadOnboardingState();
    if (state.units_weight) setUnit(state.units_weight);
    if (state.pace) setPace(state.pace);
    if (state.intent) setIntent(state.intent);
    const u = state.units_weight ?? "lb";
    if (state.current_weight_kg) {
      setCurrentInput(
        u === "lb"
          ? String(Math.round(kgToLb(state.current_weight_kg)))
          : String(Math.round(state.current_weight_kg)),
      );
    }
    if (state.target_weight_kg) {
      setTargetInput(
        u === "lb"
          ? String(Math.round(kgToLb(state.target_weight_kg)))
          : String(Math.round(state.target_weight_kg)),
      );
    }
  }, []);

  const currentNum = Number(currentInput);
  const targetNum = Number(targetInput);

  // Plausibility bounds in the active unit.
  const minDisplay = unit === "lb" ? 50 : 23;
  const maxDisplay = unit === "lb" ? 650 : 300;

  const currentValid =
    Number.isFinite(currentNum) &&
    currentNum >= minDisplay &&
    currentNum <= maxDisplay;

  // Target is required unless intent is "track" or "maintain" — but to keep the
  // flow simple we ask for it always; maintain users can enter same number.
  const needsTarget = intent === "lose" || intent === "gain";
  const targetValid =
    !needsTarget ||
    (Number.isFinite(targetNum) &&
      targetNum >= minDisplay &&
      targetNum <= maxDisplay);

  const canContinue = currentValid && targetValid && pace !== undefined;

  function toggleUnit(next: WeightUnit) {
    if (next === unit) return;
    if (currentInput && Number.isFinite(currentNum)) {
      setCurrentInput(
        String(
          Math.round(next === "kg" ? lbToKg(currentNum) : kgToLb(currentNum)),
        ),
      );
    }
    if (targetInput && Number.isFinite(targetNum)) {
      setTargetInput(
        String(
          Math.round(next === "kg" ? lbToKg(targetNum) : kgToLb(targetNum)),
        ),
      );
    }
    setUnit(next);
  }

  function handleContinue() {
    if (!canContinue || !pace) return;
    const currentKg =
      unit === "lb" ? lbToKg(currentNum) : currentNum;
    const targetKg = needsTarget
      ? unit === "lb"
        ? lbToKg(targetNum)
        : targetNum
      : currentKg;
    saveOnboardingState({
      current_weight_kg: Math.round(currentKg * 10) / 10,
      target_weight_kg: Math.round(targetKg * 10) / 10,
      pace,
      units_weight: unit,
    });
    router.push("/onboarding/plan");
  }

  return (
    <div className="flex flex-col h-full">
      <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--color-text-secondary)] mb-1">
        YOUR BODY
      </p>
      <h1 className="text-2xl font-extrabold tracking-tight leading-[1.15]">
        Where are you headed?
      </h1>
      <p className="text-sm text-[var(--color-text-secondary)] mt-1 mb-6">
        Your current and target weight.
      </p>

      <div className="flex items-center justify-between mb-1.5">
        <FieldLabel className="mb-0">CURRENT WEIGHT</FieldLabel>
        <div className="flex gap-1 text-[11px] font-semibold">
          <UnitToggle active={unit === "lb"} onClick={() => toggleUnit("lb")}>
            lb
          </UnitToggle>
          <UnitToggle active={unit === "kg"} onClick={() => toggleUnit("kg")}>
            kg
          </UnitToggle>
        </div>
      </div>
      <WeightInput
        value={currentInput}
        onChange={setCurrentInput}
        unit={unit}
        placeholder={unit === "lb" ? "172" : "78"}
        label="Current weight"
      />

      <FieldLabel className="mt-5">TARGET WEIGHT</FieldLabel>
      <WeightInput
        value={targetInput}
        onChange={setTargetInput}
        unit={unit}
        placeholder={unit === "lb" ? "165" : "75"}
        label="Target weight"
      />

      <FieldLabel className="mt-5">PACE</FieldLabel>
      <div className="flex gap-2">
        {PACE_OPTIONS.map(({ value, label }) => {
          const isSelected = pace === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setPace(value)}
              aria-pressed={isSelected}
              className={cn(
                "px-4 py-2 rounded-full text-[13px] font-semibold transition-colors",
                isSelected
                  ? "bg-[var(--color-text-primary)] text-white"
                  : "bg-[var(--color-surface-muted)] text-[var(--color-text-primary)]",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-auto pt-8">
        <Button
          size="lg"
          className="w-full h-13 rounded-2xl text-base"
          disabled={!canContinue}
          onClick={handleContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

function FieldLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[10px] font-semibold tracking-[0.12em] text-[var(--color-text-secondary)] mb-1.5",
        className,
      )}
    >
      {children}
    </p>
  );
}

function UnitToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-2.5 py-1 rounded-full transition-colors",
        active
          ? "bg-[var(--color-text-primary)] text-white"
          : "bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)]",
      )}
    >
      {children}
    </button>
  );
}

function WeightInput({
  value,
  onChange,
  unit,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: WeightUnit;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="bg-[var(--color-surface-muted)] border-transparent text-lg font-semibold h-12 pr-12"
      />
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-secondary)] font-semibold uppercase pointer-events-none">
        {unit}
      </span>
    </div>
  );
}
