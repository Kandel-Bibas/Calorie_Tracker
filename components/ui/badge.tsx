import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--color-text-primary)] text-white",
        secondary:
          "border-transparent bg-[var(--color-surface-muted)] text-[var(--color-text-primary)]",
        outline:
          "border-[var(--color-surface-border)] bg-transparent text-[var(--color-text-primary)]",
        destructive:
          "border-transparent bg-[var(--color-ring-red)] text-white",
        warning:
          "border-transparent bg-[var(--color-spark-yellow)] text-[var(--color-text-primary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
