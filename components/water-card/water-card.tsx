"use client";

import * as React from "react";
import { Droplets, Plus, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { addWater, undoLastWater } from "@/actions/water";

const ML_PER_OZ = 29.5735;

export interface WaterCardProps {
  /** Today's water total in ml (server-rendered initial value). */
  initialMl: number;
  /** Daily goal in ml. */
  goalMl: number;
  /** Display unit. */
  unit: "ml" | "oz";
}

/**
 * Hydration tracker for /today. Quick-add buttons log a drink via the
 * `addWater` server action, optimistically advancing the local total; the
 * action returns the authoritative server total which we reconcile to.
 */
export function WaterCard({ initialMl, goalMl, unit }: WaterCardProps) {
  const [ml, setMl] = React.useState(initialMl);
  const [custom, setCustom] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const { toast } = useToast();

  const increments = unit === "oz" ? [8, 16] : [250, 500];
  const toMl = (display: number) =>
    unit === "oz" ? Math.round(display * ML_PER_OZ) : display;

  const pct = goalMl > 0 ? Math.min(100, Math.round((ml / goalMl) * 100)) : 0;
  const reached = goalMl > 0 && ml >= goalMl;

  function formatVolume(m: number): string {
    if (unit === "oz") return `${Math.round(m / ML_PER_OZ)} oz`;
    if (m >= 1000) {
      const l = m / 1000;
      return `${Number.isInteger(l) ? l : l.toFixed(1)} L`;
    }
    return `${m} ml`;
  }

  function run(action: () => Promise<{ totalMl: number }>, optimistic: number) {
    const prev = ml;
    setMl(Math.max(0, optimistic));
    startTransition(async () => {
      try {
        const { totalMl } = await action();
        setMl(totalMl);
      } catch (e) {
        setMl(prev);
        toast({
          title: "Couldn't update water",
          description: e instanceof Error ? e.message : "Try again in a moment.",
          variant: "destructive",
        });
      }
    });
  }

  function addCustom() {
    const n = Number(custom);
    if (!Number.isFinite(n) || n <= 0) return;
    const amt = toMl(n);
    run(() => addWater(amt), ml + amt);
    setCustom("");
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-[var(--color-surface)] p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
          <Droplets className="h-4 w-4 text-[var(--color-accent-blue)]" />
          Water
        </h2>
        <span className="text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
          {formatVolume(ml)}
          <span className="text-[var(--color-text-secondary)]">
            {" "}/ {formatVolume(goalMl)}
          </span>
        </span>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
        <div
          className="h-full rounded-full bg-[var(--color-accent-blue)] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        {increments.map((inc) => (
          <Button
            key={inc}
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => addWater(toMl(inc)), ml + toMl(inc))}
            className="flex-1"
          >
            <Plus className="h-4 w-4" />
            {inc} {unit}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending || ml <= 0}
          onClick={() => run(() => undoLastWater(), ml - toMl(increments[0] ?? 0))}
          aria-label="Undo last drink"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          placeholder={`Custom amount (${unit})`}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          disabled={pending}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !custom.trim() || Number(custom) <= 0}
          onClick={addCustom}
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {reached ? (
        <p className="text-xs font-medium text-[var(--color-accent-blue)]">
          Hydration goal reached 💧
        </p>
      ) : null}
    </section>
  );
}
