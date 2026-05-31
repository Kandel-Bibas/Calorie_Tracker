"use client";

import * as React from "react";
import confetti from "canvas-confetti";

import { cn } from "@/lib/cn";

export interface DailyRingProps {
  consumed: number;
  target: number;
  errorBandLow?: number;
  errorBandHigh?: number;
  size?: number;
  className?: string;
}

/**
 * Returns the appropriate ring color based on consumed/target ratio.
 *  - within 5% of goal (>=95% and <=105%): green
 *  - over 105%: orange
 *  - under 95%: ring-red (default for under-goal)
 */
function pickColor(consumed: number, target: number): string {
  if (target <= 0) return "#FF3B30";
  const ratio = consumed / target;
  if (ratio >= 0.95 && ratio <= 1.05) return "#34C759";
  if (ratio > 1.05) return "#FF9500";
  return "#FF3B30";
}

function fireConfetti() {
  if (typeof window === "undefined") return;
  try {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.5 },
      colors: ["#FF6B35", "#FFB627", "#34C759", "#007AFF"],
    });
  } catch {
    /* canvas-confetti can throw in environments w/o canvas; ignore */
  }
}

export function DailyRing({
  consumed,
  target,
  errorBandLow,
  errorBandHigh,
  size = 240,
  className,
}: DailyRingProps) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = target > 0 ? Math.min(consumed / target, 1) : 0;
  const dashOffset = circumference * (1 - ratio);
  const color = pickColor(consumed, target);

  // Confetti when crossing target from below
  const wasUnderRef = React.useRef<boolean>(consumed < target);
  React.useEffect(() => {
    const wasUnder = wasUnderRef.current;
    const isOver = consumed >= target && target > 0;
    if (wasUnder && isOver) {
      fireConfetti();
    }
    wasUnderRef.current = consumed < target;
  }, [consumed, target]);

  const cx = size / 2;
  const cy = size / 2;

  const hasBand =
    typeof errorBandLow === "number" && typeof errorBandHigh === "number";
  const bandWidth = hasBand
    ? Math.round(((errorBandHigh as number) - (errorBandLow as number)) / 2)
    : null;

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center",
        className
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(consumed)} of ${Math.round(target)} kilocalories`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
      >
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--color-surface-muted)"
          strokeWidth={strokeWidth}
        />
        {/* Filled portion */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: "stroke-dashoffset 600ms ease, stroke 400ms ease",
          }}
        />
      </svg>
      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        <div
          className="font-semibold tabular-nums leading-none text-[var(--color-text-primary)]"
          style={{ fontSize: size * 0.22 }}
        >
          {Math.round(consumed)}
        </div>
        <div
          className="mt-1 text-[var(--color-text-secondary)] tabular-nums"
          style={{ fontSize: size * 0.075 }}
        >
          / {Math.round(target)} kcal
        </div>
        {bandWidth !== null && bandWidth > 0 ? (
          <div
            className="mt-1 text-[var(--color-text-tertiary)] tabular-nums"
            style={{ fontSize: size * 0.06 }}
          >
            ± {bandWidth} kcal
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default DailyRing;
