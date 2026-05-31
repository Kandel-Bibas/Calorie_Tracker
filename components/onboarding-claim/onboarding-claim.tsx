"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  loadOnboardingState,
  clearOnboardingState,
} from "@/lib/onboarding-state";
import { claimOnboarding } from "@/actions/onboarding";

/**
 * Mount on authenticated pages (e.g. inside `app/(app)/layout.tsx`).
 *
 * On first render after sign-in, checks localStorage for a pending
 * onboarding draft. If one exists, posts it to the `claimOnboarding`
 * Server Action — which checks whether the user already has a profile
 * (idempotent) and, if not, persists profile + initial goal + first
 * weight. Then clears localStorage and refreshes the page so RSCs
 * pick up the new data.
 *
 * If the user opened the magic link on a different device than they
 * onboarded on, localStorage is empty and this component does nothing.
 * In that case the user lands on a sparse `/today` and can re-enter
 * via `/onboarding`.
 */
export function OnboardingClaim({ userId }: { userId: string }) {
  const router = useRouter();
  const ranRef = React.useRef(false);

  React.useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const state = loadOnboardingState();
    const hasMeaningfulData =
      state.sex && state.birth_year && state.height_cm && state.current_weight_kg && state.intent;
    if (!hasMeaningfulData) return;

    const flagKey = `onboarding_claimed:${userId}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(flagKey)) {
      return;
    }

    (async () => {
      const result = await claimOnboarding(state);
      if (result.ok) {
        clearOnboardingState();
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(flagKey, "1");
        }
        if (!result.alreadyClaimed) {
          // Refresh so RSCs (e.g. /today's ring + meal list) pick up the
          // newly-written profile + goal rows.
          router.refresh();
        }
      } else {
        console.error("claimOnboarding failed:", result.error);
      }
    })();
  }, [router, userId]);

  return null;
}
