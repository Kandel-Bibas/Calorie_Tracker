"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  cmToFeetInches,
  feetInchesToCm,
  loadOnboardingState,
  saveOnboardingState,
  type OnboardingState,
} from "@/lib/onboarding-state";

type Sex = NonNullable<OnboardingState["sex"]>;
type HeightUnit = NonNullable<OnboardingState["units_height"]>;

const SEX_OPTIONS: ReadonlyArray<{ value: Sex; label: string }> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not", label: "Prefer not" },
];

const CURRENT_YEAR = new Date().getFullYear();
const MIN_AGE = 13;
const MAX_AGE = 100;

/**
 * Step 3 — Basics: sex, age, height. All required for Mifflin-St Jeor.
 *
 * Age is captured as a number; we persist `birth_year = currentYear - age`.
 * Height supports both ft+in and cm via a unit toggle — internally we always
 * normalise to centimetres.
 */
export default function OnboardingAboutPage() {
  const router = useRouter();

  const [sex, setSex] = React.useState<Sex | undefined>(undefined);
  const [age, setAge] = React.useState<string>("");
  const [heightUnit, setHeightUnit] = React.useState<HeightUnit>("ft");
  const [feet, setFeet] = React.useState<string>("");
  const [inches, setInches] = React.useState<string>("");
  const [heightCm, setHeightCm] = React.useState<string>("");

  // Hydrate from saved state.
  React.useEffect(() => {
    const state = loadOnboardingState();
    if (state.sex) setSex(state.sex);
    if (state.birth_year) {
      const computedAge = CURRENT_YEAR - state.birth_year;
      if (computedAge >= MIN_AGE && computedAge <= MAX_AGE) {
        setAge(String(computedAge));
      }
    }
    if (state.units_height) setHeightUnit(state.units_height);
    if (state.height_cm) {
      if ((state.units_height ?? "ft") === "cm") {
        setHeightCm(String(state.height_cm));
      } else {
        const { feet: f, inches: i } = cmToFeetInches(state.height_cm);
        setFeet(String(f));
        setInches(String(i));
      }
    }
  }, []);

  const ageNum = Number(age);
  const feetNum = Number(feet);
  const inchesNum = Number(inches);
  const cmNum = Number(heightCm);

  const ageValid =
    Number.isFinite(ageNum) && ageNum >= MIN_AGE && ageNum <= MAX_AGE;

  const heightValid =
    heightUnit === "ft"
      ? Number.isFinite(feetNum) &&
        feetNum >= 3 &&
        feetNum <= 8 &&
        Number.isFinite(inchesNum) &&
        inchesNum >= 0 &&
        inchesNum < 12
      : Number.isFinite(cmNum) && cmNum >= 100 && cmNum <= 250;

  const canContinue = sex !== undefined && ageValid && heightValid;

  function handleContinue() {
    if (!canContinue || !sex) return;
    const cm =
      heightUnit === "ft"
        ? Math.round(feetInchesToCm(feetNum, inchesNum))
        : Math.round(cmNum);
    saveOnboardingState({
      sex,
      birth_year: CURRENT_YEAR - ageNum,
      height_cm: cm,
      units_height: heightUnit,
    });
    router.push("/onboarding/body");
  }

  function toggleHeightUnit(next: HeightUnit) {
    if (next === heightUnit) return;
    // Convert current value across units so the user doesn't lose what they typed.
    if (next === "cm" && feet && Number.isFinite(feetNum)) {
      const cm = Math.round(
        feetInchesToCm(feetNum, Number.isFinite(inchesNum) ? inchesNum : 0),
      );
      setHeightCm(String(cm));
    } else if (next === "ft" && heightCm && Number.isFinite(cmNum)) {
      const { feet: f, inches: i } = cmToFeetInches(cmNum);
      setFeet(String(f));
      setInches(String(i));
    }
    setHeightUnit(next);
  }

  return (
    <div className="flex flex-col h-full">
      <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--color-text-secondary)] mb-1">
        ABOUT YOU
      </p>
      <h1 className="text-2xl font-extrabold tracking-tight leading-[1.15]">
        A few basics.
      </h1>
      <p className="text-sm text-[var(--color-text-secondary)] mt-1 mb-6">
        Stays private. Used to compute your target.
      </p>

      <FieldLabel>SEX</FieldLabel>
      <div className="flex gap-2 mb-5">
        {SEX_OPTIONS.map(({ value, label }) => {
          const isSelected = sex === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setSex(value)}
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

      <FieldLabel>AGE</FieldLabel>
      <Input
        type="number"
        inputMode="numeric"
        min={MIN_AGE}
        max={MAX_AGE}
        placeholder="28"
        value={age}
        onChange={(e) => setAge(e.target.value)}
        className="bg-[var(--color-surface-muted)] border-transparent text-lg font-semibold h-12 mb-5"
      />

      <div className="flex items-center justify-between mb-1">
        <FieldLabel className="mb-0">HEIGHT</FieldLabel>
        <div className="flex gap-1 text-[11px] font-semibold">
          <UnitToggle
            active={heightUnit === "ft"}
            onClick={() => toggleHeightUnit("ft")}
          >
            ft / in
          </UnitToggle>
          <UnitToggle
            active={heightUnit === "cm"}
            onClick={() => toggleHeightUnit("cm")}
          >
            cm
          </UnitToggle>
        </div>
      </div>

      {heightUnit === "ft" ? (
        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={3}
            max={8}
            placeholder="5"
            value={feet}
            onChange={(e) => setFeet(e.target.value)}
            aria-label="Feet"
            className="bg-[var(--color-surface-muted)] border-transparent text-lg font-semibold h-12"
          />
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={11}
            placeholder="10"
            value={inches}
            onChange={(e) => setInches(e.target.value)}
            aria-label="Inches"
            className="bg-[var(--color-surface-muted)] border-transparent text-lg font-semibold h-12"
          />
        </div>
      ) : (
        <Input
          type="number"
          inputMode="numeric"
          min={100}
          max={250}
          placeholder="178"
          value={heightCm}
          onChange={(e) => setHeightCm(e.target.value)}
          aria-label="Height in centimetres"
          className="bg-[var(--color-surface-muted)] border-transparent text-lg font-semibold h-12"
        />
      )}

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
