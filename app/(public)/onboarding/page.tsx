"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spark } from "@/components/spark";

/**
 * Step 1 — Welcome.
 *
 * Soft pastel hero containing a large waving Spark mascot, value-prop
 * headline, sub-copy, primary CTA → /onboarding/goal, secondary link to
 * /login. No state captured here; this screen just establishes tone.
 */
export default function OnboardingWelcomePage() {
  return (
    <div className="flex flex-col h-full">
      <section
        className="rounded-3xl px-6 py-8 flex flex-col items-center gap-3"
        style={{
          background:
            "linear-gradient(160deg, #FFF8F3 0%, #FFE9DD 100%)",
        }}
      >
        <Spark variant="wave" size={120} />
        <p className="text-xs font-semibold text-[#3D2C1E]">
          Hi, I&apos;m Spark.
        </p>
      </section>

      <div className="mt-7 flex flex-col gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight leading-[1.1]">
          Track what you eat.
          <br />
          Effortlessly.
        </h1>
        <p className="text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
          Snap a photo, say what it is. We figure out the rest. No databases,
          no portions to weigh.
        </p>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-8">
        <Button asChild size="lg" className="h-13 rounded-2xl text-base">
          <Link href="/onboarding/goal">
            Get started
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
        <Link
          href="/login"
          className="text-center text-sm font-medium text-[var(--color-text-secondary)] py-2"
        >
          I already have an account
        </Link>
      </div>
    </div>
  );
}
