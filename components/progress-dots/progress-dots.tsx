"use client";

import * as React from "react";

import { cn } from "@/lib/cn";

export interface ProgressDotsProps {
  totalSteps: number;
  currentStep: number;
  className?: string;
}

/**
 * Horizontal step indicator used in onboarding.
 * Each step is a small pill (14px wide); the active step expands to 22px and darkens.
 * Width transitions smoothly on currentStep change.
 */
export function ProgressDots({
  totalSteps,
  currentStep,
  className,
}: ProgressDotsProps) {
  const safeTotal = Math.max(1, Math.floor(totalSteps));
  const safeCurrent = Math.min(Math.max(0, Math.floor(currentStep)), safeTotal - 1);

  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={safeTotal}
      aria-valuenow={safeCurrent + 1}
      aria-label={`Step ${safeCurrent + 1} of ${safeTotal}`}
      className={cn("flex items-center justify-center gap-1.5", className)}
    >
      {Array.from({ length: safeTotal }).map((_, i) => {
        const active = i === safeCurrent;
        return (
          <span
            key={i}
            className={cn(
              "h-1 rounded-full transition-all duration-300 ease-out",
              active
                ? "bg-[var(--color-text-primary)]"
                : "bg-[var(--color-surface-border)]"
            )}
            style={{ width: active ? 22 : 14 }}
          />
        );
      })}
    </div>
  );
}

export default ProgressDots;
