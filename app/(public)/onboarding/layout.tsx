"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { ProgressDots } from "@/components/progress-dots";

/**
 * Infer which of the 7 onboarding steps the current pathname maps to.
 * Returns a 0-indexed step. Anything unrecognised defaults to step 0.
 */
function inferStepIndex(pathname: string): number {
  // Strip trailing slash for consistent matching.
  const path = pathname.replace(/\/+$/, "");
  if (path.endsWith("/onboarding/goal")) return 1;
  if (path.endsWith("/onboarding/about")) return 2;
  if (path.endsWith("/onboarding/body")) return 3;
  if (path.endsWith("/onboarding/plan")) return 4;
  if (path.endsWith("/onboarding/streak")) return 5;
  if (path.endsWith("/onboarding/first-meal")) return 6;
  return 0;
}

/**
 * Onboarding chrome: progress dots up top, then the step body inside an
 * AnimatePresence so route transitions slide left. We key the motion.div on
 * the pathname so React tears down the previous step and mounts the next —
 * Framer Motion handles the in/out tweens.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const stepIndex = inferStepIndex(pathname);

  return (
    <main className="min-h-screen flex flex-col bg-[var(--color-surface)]">
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col px-5 pt-6 pb-8">
        <ProgressDots
          totalSteps={7}
          currentStep={stepIndex}
          className="mb-5"
        />
        <div className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              className="flex-1 flex flex-col h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
