"use client";

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/cn";

export interface WeightPoint {
  /** YYYY-MM-DD */
  date: string;
  /** In display units (kg or lb) already converted upstream. */
  weight: number;
}

export interface WeightChartProps {
  points: WeightPoint[];
  unit: "lb" | "kg";
  /** Optional goal weight (display units) — drawn as a reference line. */
  goalWeight?: number | null;
  className?: string;
}

type Range = "30d" | "90d" | "1y" | "all";

const RANGE_DAYS: Record<Exclude<Range, "all">, number> = {
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

/**
 * 7-day backward moving average. Each point averages the last 7 actual
 * weights (inclusive). Sparse days are dropped (we don't fill gaps).
 */
function movingAvg(points: WeightPoint[], window = 7): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < points.length; i++) {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1);
    if (slice.length === 0) {
      result.push(null);
      continue;
    }
    const sum = slice.reduce((a, p) => a + p.weight, 0);
    result.push(Math.round((sum / slice.length) * 100) / 100);
  }
  return result;
}

export function WeightChart({ points, unit, goalWeight, className }: WeightChartProps) {
  const [range, setRange] = React.useState<Range>("90d");

  const filtered = React.useMemo(() => {
    if (range === "all") return points;
    const days = RANGE_DAYS[range];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffIso = (() => {
      const y = cutoff.getFullYear();
      const m = String(cutoff.getMonth() + 1).padStart(2, "0");
      const day = String(cutoff.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    return points.filter((p) => p.date >= cutoffIso);
  }, [points, range]);

  const data = React.useMemo(() => {
    const avg = movingAvg(filtered);
    return filtered.map((p, i) => ({
      date: p.date,
      weight: p.weight,
      avg7: avg[i],
    }));
  }, [filtered]);

  // Pad the Y domain so the goal reference line stays visible even when the
  // goal sits outside the logged range.
  const yDomain = React.useMemo<[number | string, number | string]>(() => {
    const ys = data.map((d) => d.weight);
    if (goalWeight != null) ys.push(goalWeight);
    if (ys.length === 0) return ["dataMin - 1", "dataMax + 1"];
    return [Math.floor(Math.min(...ys) - 1), Math.ceil(Math.max(...ys) + 1)];
  }, [data, goalWeight]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-1.5">
        {(["30d", "90d", "1y", "all"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={
              r === range
                ? "rounded-full bg-[var(--color-text-primary)] px-3 py-1 text-xs font-medium text-[var(--color-surface)]"
                : "rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-muted)]"
            }
          >
            {r}
          </button>
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-[var(--color-surface)] p-3 shadow-sm">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-secondary)]">
            No weight logged in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid
                stroke="var(--color-surface-border)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="date"
                stroke="var(--color-text-secondary)"
                fontSize={11}
                tickFormatter={(d: string) => d.slice(5)}
                minTickGap={20}
              />
              <YAxis
                stroke="var(--color-text-secondary)"
                fontSize={11}
                domain={yDomain}
                tickFormatter={(v: number) => `${Math.round(v)}`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--color-surface-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text-primary)",
                  fontSize: 12,
                }}
                formatter={(value: number) => [`${value} ${unit}`, ""]}
              />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="var(--color-flame-outer)"
                strokeWidth={2}
                dot={{ r: 2.5, fill: "var(--color-flame-outer)" }}
                isAnimationActive={false}
                name="Weight"
              />
              <Line
                type="monotone"
                dataKey="avg7"
                stroke="var(--color-accent-blue)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
                name="7-day avg"
              />
              {goalWeight != null ? (
                <ReferenceLine
                  y={goalWeight}
                  stroke="var(--color-success-green)"
                  strokeDasharray="5 3"
                  strokeWidth={1.5}
                  label={{
                    value: `Goal ${goalWeight}`,
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "var(--color-success-green)",
                  }}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default WeightChart;
