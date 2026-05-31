/**
 * Onboarding state persistence (client-only).
 *
 * The 7-step onboarding flow collects profile + goal info before auth. Each
 * screen reads the previous state, updates a slice, and writes it back to
 * localStorage under the key `onboarding_state`. Auth is deferred until the
 * user attempts to save their first meal — at that point the signup modal
 * triggers, and after sign-up `/log/review` reads this state, calls
 * `completeOnboarding(...)`, then clears it. If the user abandons the flow
 * the state lives for 7 days (we expose `clearOnboardingState` and the
 * draft is dropped after `completeOnboarding` succeeds).
 *
 * All helpers are safe to call during SSR — they no-op when `window` is
 * undefined.
 */

export interface OnboardingState {
  intent?: "lose" | "maintain" | "gain" | "track";
  sex?: "male" | "female" | "prefer_not";
  birth_year?: number;
  height_cm?: number;
  current_weight_kg?: number;
  target_weight_kg?: number;
  pace?: "easy" | "steady" | "aggressive";
  /** User-editable override on the Plan screen. If unset, recompute from inputs. */
  daily_kcal?: number;
  /** "HH:MM" 24h, or null/undefined to skip reminders. */
  reminder_time?: string | null;
  timezone?: string;
  units_weight?: "lb" | "kg";
  units_height?: "ft" | "cm";
}

const STORAGE_KEY = "onboarding_state";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/**
 * Read the current onboarding state. Returns `{}` if missing or invalid.
 */
export function loadOnboardingState(): OnboardingState {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as OnboardingState;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Merge `patch` into the current onboarding state and persist.
 * Last-write-wins for each field. Pass `null` to clear a single field.
 */
export function saveOnboardingState(patch: Partial<OnboardingState>): void {
  if (!isBrowser()) return;
  try {
    const current = loadOnboardingState();
    const next: OnboardingState = { ...current, ...patch };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage may throw under quota / private-mode. Ignore — state is
    // best-effort; the user can re-enter data.
  }
}

/**
 * Drop the entire onboarding draft. Called after `completeOnboarding`
 * succeeds, or when the user explicitly resets.
 */
export function clearOnboardingState(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---------- unit conversion helpers (shared across screens) ----------

export const LB_PER_KG = 2.20462;
export const CM_PER_INCH = 2.54;

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_INCH;
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / CM_PER_INCH;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - feet * 12);
  return { feet, inches };
}
