"use client";

import * as React from "react";
import { motion, type Variants } from "framer-motion";

import { cn } from "@/lib/cn";

const FLAME_OUTER_D =
  "M50 8 C 35 22, 25 38, 32 55 C 22 56, 16 72, 28 84 C 40 96, 60 96, 72 84 C 84 72, 78 56, 68 55 C 75 38, 65 22, 50 8 Z";
const FLAME_INNER_D =
  "M50 28 C 40 40, 36 52, 42 62 C 35 64, 33 74, 42 82 C 50 88, 50 88, 58 82 C 67 74, 65 64, 58 62 C 64 52, 60 40, 50 28 Z";

export type SparkVariant = "idle" | "wobble" | "thinking" | "wave";

export interface SparkProps {
  size?: number;
  variant?: SparkVariant;
  className?: string;
  onAnimationComplete?: () => void;
}

/**
 * Body-level transforms (rotate + scale + y) per variant.
 * The flame paths inside still independently flicker via a separate motion target.
 */
const bodyVariants: Variants = {
  idle: {
    y: [0, -6, 0],
    rotate: 0,
    scale: 1,
    transition: {
      y: {
        duration: 1.4,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
  },
  wobble: {
    rotate: [-12, 10, -8, 6, 0],
    scale: [1.15, 1.18, 1.15, 1.1, 1],
    y: 0,
    transition: {
      duration: 0.9,
      ease: "easeInOut",
    },
  },
  thinking: {
    y: [0, -3, 0],
    rotate: 0,
    scale: 1,
    transition: {
      y: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
    },
  },
  wave: {
    rotate: [0, -14, 10, -6, 4, 0],
    y: [0, -4, 0, -2, 0, 0],
    scale: 1,
    transition: { duration: 1.1, ease: "easeInOut" },
  },
};

const outerFlameVariants: Variants = {
  idle: {
    scaleY: [1, 1.04, 0.98, 1.02, 1],
    transition: { duration: 0.6, repeat: Infinity, ease: "easeInOut" },
  },
  wobble: {
    scaleY: [1, 1.08, 1.04, 1.06, 1],
    transition: { duration: 0.5, repeat: Infinity, ease: "easeInOut" },
  },
  thinking: {
    scaleY: [1, 1.02, 1],
    transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" },
  },
  wave: {
    scaleY: [1, 1.05, 0.98, 1.03, 1],
    transition: { duration: 0.7, repeat: Infinity, ease: "easeInOut" },
  },
};

const innerFlameVariants: Variants = {
  idle: {
    scaleY: [1, 0.95, 1.03, 0.98, 1],
    transition: {
      duration: 0.55,
      repeat: Infinity,
      ease: "easeInOut",
      delay: 0.1,
    },
  },
  wobble: {
    scaleY: [1, 1.06, 0.96, 1.04, 1],
    transition: { duration: 0.45, repeat: Infinity, ease: "easeInOut" },
  },
  thinking: {
    scaleY: [1, 0.98, 1.02, 1],
    transition: { duration: 1.4, repeat: Infinity, ease: "easeInOut" },
  },
  wave: {
    scaleY: [1, 1.03, 0.98, 1.02, 1],
    transition: {
      duration: 0.6,
      repeat: Infinity,
      ease: "easeInOut",
      delay: 0.1,
    },
  },
};

/**
 * Pupil position relative to base (42,64) and (58,64).
 * "thinking" sweeps up-right and back over 2s.
 */
const leftPupilVariants: Variants = {
  idle: { cx: 42, cy: 64 },
  wobble: { cx: 42, cy: 64 },
  wave: { cx: 42, cy: 64 },
  thinking: {
    cx: [42, 44, 44, 42, 42],
    cy: [64, 61, 64, 67, 64],
    transition: { duration: 2, repeat: Infinity, ease: "easeInOut" },
  },
};

const rightPupilVariants: Variants = {
  idle: { cx: 58, cy: 64 },
  wobble: { cx: 58, cy: 64 },
  wave: { cx: 58, cy: 64 },
  thinking: {
    cx: [58, 60, 60, 58, 58],
    cy: [64, 61, 64, 67, 64],
    transition: { duration: 2, repeat: Infinity, ease: "easeInOut" },
  },
};

export function Spark({
  size = 96,
  variant = "idle",
  className,
  onAnimationComplete,
}: SparkProps) {
  return (
    <motion.svg
      role="img"
      aria-label="Spark mascot"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn("select-none", className)}
      initial={false}
      animate={variant}
      variants={bodyVariants}
      style={{ transformOrigin: "50% 70%" }}
      onAnimationComplete={onAnimationComplete}
    >
      {/* Outer flame */}
      <motion.path
        d={FLAME_OUTER_D}
        fill="var(--color-flame-outer)"
        variants={outerFlameVariants}
        animate={variant}
        style={{ transformOrigin: "50% 90%", transformBox: "fill-box" }}
      />
      {/* Inner flame */}
      <motion.path
        d={FLAME_INNER_D}
        fill="var(--color-flame-inner)"
        variants={innerFlameVariants}
        animate={variant}
        style={{ transformOrigin: "50% 88%", transformBox: "fill-box" }}
      />
      {/* Eye whites */}
      <ellipse cx="42" cy="62" rx="5.5" ry="6.5" fill="white" />
      <ellipse cx="58" cy="62" rx="5.5" ry="6.5" fill="white" />
      {/* Pupils */}
      <motion.circle
        r={2.8}
        fill="#1C1C1E"
        variants={leftPupilVariants}
        animate={variant}
        initial={{ cx: 42, cy: 64 }}
      />
      <motion.circle
        r={2.8}
        fill="#1C1C1E"
        variants={rightPupilVariants}
        animate={variant}
        initial={{ cx: 58, cy: 64 }}
      />
      {/* Eye highlights */}
      <circle cx="43.2" cy="62.8" r="1.1" fill="white" />
      <circle cx="59.2" cy="62.8" r="1.1" fill="white" />
      {/* Smile */}
      <path
        d="M 44 75 Q 50 79 56 75"
        stroke="#1C1C1E"
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
      />
    </motion.svg>
  );
}

export default Spark;
