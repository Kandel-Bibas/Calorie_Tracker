import { cn } from "@/lib/cn";

export interface MacrosRowProps {
  protein_g: number;
  carb_g: number;
  fat_g: number;
  protein_target: number | null;
  carb_target: number | null;
  fat_target: number | null;
  className?: string;
}

/**
 * Three little progress bars under the daily ring — one each for protein,
 * carbs, fat. Bar fills relative to the goal's target (capped at 100%
 * visually, but the numeric label always shows the real total).
 *
 *   P  ████░░  72 / 140 g
 *   C  █████░  180 / 220 g
 *   F  ███░░░  45 / 73 g
 */
export function MacrosRow({
  protein_g,
  carb_g,
  fat_g,
  protein_target,
  carb_target,
  fat_target,
  className,
}: MacrosRowProps) {
  return (
    <div className={cn("grid grid-cols-3 gap-3 px-4 w-full", className)}>
      <Bar
        label="Protein"
        current={protein_g}
        target={protein_target}
        color="var(--color-success-green)"
      />
      <Bar
        label="Carbs"
        current={carb_g}
        target={carb_target}
        color="var(--color-accent-blue)"
      />
      <Bar
        label="Fat"
        current={fat_g}
        target={fat_target}
        color="var(--color-spark-orange)"
      />
    </div>
  );
}

function Bar({
  label,
  current,
  target,
  color,
}: {
  label: string;
  current: number;
  target: number | null;
  color: string;
}) {
  const pct = target && target > 0
    ? Math.min(100, Math.round((current / target) * 100))
    : 0;
  const display = Math.round(current);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-[var(--color-text-tertiary)]">
          {target ? `${display}/${target}g` : `${display}g`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-surface-muted)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
