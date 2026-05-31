"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { CaptureControls, type CapturePayload } from "@/components/capture";
import { stashPendingCapture } from "@/lib/pending-capture";

/**
 * Step 7 — First meal.
 *
 * Live capture flow. The user can snap a photo, speak, or type right here —
 * BEFORE they sign in. The capture is stashed in localStorage, the user is
 * forwarded to /login?next=/log, and once they're authenticated /log picks
 * up the stash and auto-analyzes via /api/analyze.
 *
 * If the user doesn't want to capture yet, the "Skip" link sends them
 * straight to /login?next=/today and they can start logging later.
 */
export default function OnboardingFirstMealPage() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const onSubmit = async (payload: CapturePayload) => {
    if (pending) return;
    setPending(true);
    try {
      await stashPendingCapture({
        photoBlob: payload.photoBlob,
        audioBlob: payload.audioBlob,
        transcript: payload.transcript,
        typedText: payload.typedText,
      });
      router.push("/login?next=%2Flog");
    } catch (err) {
      console.error("stash failed:", err);
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--color-text-secondary)] mb-2">
        FIRST MEAL
      </p>

      <div className="inline-flex items-center gap-1.5 self-start rounded-xl bg-[#F0FDF4] text-[#15803D] px-3 py-2 text-xs font-semibold mb-3">
        <Check className="w-3.5 h-3.5" strokeWidth={3} />
        You&apos;re all set
      </div>

      <h1 className="text-2xl font-extrabold tracking-tight leading-[1.15]">
        Log your first meal?
      </h1>
      <p className="text-sm text-[var(--color-text-secondary)] mt-1 mb-5">
        Snap, speak, or type. Spark will analyze it after you sign in.
      </p>

      <CaptureControls onSubmit={onSubmit} disabled={pending} />

      <div className="mt-6 pt-2 text-center">
        <Link
          href="/login?next=%2Ftoday"
          className="text-sm font-medium text-[var(--color-text-secondary)] py-2"
        >
          {pending ? "Saving capture…" : "Skip — take me to my dashboard"}
        </Link>
      </div>
    </div>
  );
}
