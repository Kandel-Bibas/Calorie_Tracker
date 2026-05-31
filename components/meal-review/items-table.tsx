"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { saveMeal, type SaveMealEdit } from "@/actions/meals";

export interface DraftItemForTable {
  usda_query: string;
  display_name: string;
  grams: number;
  kcal: number | null;
  protein_g: number | null;
  carb_g: number | null;
  fat_g: number | null;
  source: string | null;
  fell_back: boolean;
}

export interface ItemsTableProps {
  draftId: string;
  items: DraftItemForTable[];
  totals: {
    kcal: number;
    error_band_low: number;
    error_band_high: number;
  };
  mealLabel: string;
}

interface Row extends DraftItemForTable {
  /** Original grams when the draft was created — used to detect edits. */
  originalGrams: number;
  /** Original usda_query at draft time. */
  originalQuery: string;
  /** True for rows the user added on the review page. */
  isNew: boolean;
}

function sourceBadge(item: { source: string | null; fell_back: boolean }) {
  if (item.source == null) {
    return { text: "Help us match", variant: "warning" as const };
  }
  if (item.source === "user_override") {
    return { text: "Recipe", variant: "secondary" as const };
  }
  if (item.source === "fatsecret") {
    return { text: "FatSecret", variant: "secondary" as const };
  }
  if (item.source === "calorie_ninjas") {
    return { text: "Ninjas", variant: "secondary" as const };
  }
  if (item.source === "open_food_facts") {
    return { text: "OFF", variant: "outline" as const };
  }
  if (item.source === "gemini_estimate") {
    return { text: "Spark AI", variant: "secondary" as const };
  }
  // Legacy USDA rows that were saved before the pipeline change.
  if (item.source.startsWith("usda")) {
    return { text: "USDA (legacy)", variant: "outline" as const };
  }
  return { text: item.source, variant: "outline" as const };
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealType = (typeof MEAL_TYPES)[number];

function guessMealType(): MealType {
  const hour = new Date().getHours();
  if (hour < 10) return "breakfast";
  if (hour < 14) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

export function ItemsTable({
  draftId,
  items,
  totals,
  mealLabel,
}: ItemsTableProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [rows, setRows] = React.useState<Row[]>(() =>
    items.map((it) => ({
      ...it,
      originalGrams: it.grams,
      originalQuery: it.usda_query,
      isNew: false,
    })),
  );
  const [mealType, setMealType] = React.useState<MealType>(guessMealType());
  const [saving, setSaving] = React.useState(false);

  const onGramsChange = (idx: number, gramsStr: string) => {
    const grams = parseFloat(gramsStr);
    if (!Number.isFinite(grams) || grams < 0) return;
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const factor = r.originalGrams > 0 ? grams / r.originalGrams : 1;
        return {
          ...r,
          grams,
          kcal:
            r.kcal != null && r.originalGrams > 0
              ? Math.round(r.kcal * factor * 10) / 10
              : r.kcal,
        };
      }),
    );
  };

  const onNameChange = (idx: number, name: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, display_name: name } : r)));
  };

  const onRemove = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const onAdd = () => {
    setRows((prev) => [
      ...prev,
      {
        usda_query: "",
        display_name: "",
        grams: 100,
        kcal: null,
        protein_g: null,
        carb_g: null,
        fat_g: null,
        source: null,
        fell_back: true,
        originalGrams: 100,
        originalQuery: "",
        isNew: true,
      },
    ]);
  };

  const totalKcalDisplay = rows.reduce((a, r) => a + (r.kcal ?? 0), 0);

  const onSave = async () => {
    setSaving(true);
    try {
      // Build edits relative to the original draft order.
      const edits: SaveMealEdit[] = [];
      for (let i = 0; i < rows.length && i < items.length; i++) {
        const r = rows[i]!;
        if (r.isNew) continue;
        if (
          r.grams !== r.originalGrams ||
          r.usda_query !== r.originalQuery ||
          r.display_name !== items[i]!.display_name
        ) {
          const edit: SaveMealEdit = { itemIndex: i };
          if (r.grams !== r.originalGrams) edit.grams = r.grams;
          if (r.usda_query !== r.originalQuery) edit.usda_query = r.usda_query;
          if (r.display_name !== items[i]!.display_name)
            edit.display_name = r.display_name;
          edits.push(edit);
        }
      }
      await saveMeal({ draftId, edits, mealType });
      toast({ title: "Meal saved", variant: "success" });
      router.push("/today");
      router.refresh();
    } catch (err) {
      toast({
        title: "Couldn't save",
        description: err instanceof Error ? err.message : "unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const band = Math.max(
    0,
    Math.round((totals.error_band_high - totals.error_band_low) / 2),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {mealLabel}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {MEAL_TYPES.map((mt) => (
            <button
              key={mt}
              type="button"
              onClick={() => setMealType(mt)}
              className={
                mt === mealType
                  ? "rounded-full bg-[var(--color-text-primary)] px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }
            >
              {mt[0]?.toUpperCase() + mt.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-[var(--color-surface-border)] rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)]">
        {rows.map((r, i) => {
          const src = sourceBadge(r);
          return (
            <li key={i} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Input
                  value={r.display_name}
                  onChange={(e) => onNameChange(i, e.target.value)}
                  placeholder="Item name"
                  className="h-9 text-sm"
                />
                <div className="flex items-center gap-2">
                  <Badge variant={src.variant} className="text-[10px]">
                    {src.text}
                  </Badge>
                  <span className="text-xs text-[var(--color-text-tertiary)] tabular-nums">
                    {r.kcal != null ? `${Math.round(r.kcal)} kcal` : "— kcal"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min={0}
                  value={r.grams}
                  onChange={(e) => onGramsChange(i, e.target.value)}
                  className="h-9 w-20 text-right text-sm tabular-nums"
                />
                <span className="text-xs text-[var(--color-text-tertiary)]">g</span>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  aria-label="Remove item"
                  className="rounded-md p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ring-red)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onAdd}
            className="flex w-full items-center justify-center gap-1.5 p-3 text-sm font-medium text-[var(--color-accent-blue)] hover:bg-[var(--color-surface-muted)]"
          >
            <Plus className="h-4 w-4" /> Add item
          </button>
        </li>
      </ul>

      <div className="flex items-center justify-between rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
        <span className="text-sm uppercase tracking-wider text-[var(--color-text-secondary)]">
          Total
        </span>
        <span className="text-xl font-semibold tabular-nums text-[var(--color-text-primary)]">
          {Math.round(totalKcalDisplay)}{" "}
          {band > 0 ? (
            <span className="text-sm font-normal text-[var(--color-text-tertiary)]">
              ± {band}
            </span>
          ) : null}{" "}
          kcal
        </span>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => router.back()}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button onClick={onSave} disabled={saving || rows.length === 0}>
          {saving ? "Saving…" : "Save meal"}
        </Button>
      </div>
    </div>
  );
}

export default ItemsTable;
