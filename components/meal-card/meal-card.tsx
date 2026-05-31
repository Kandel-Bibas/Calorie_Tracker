"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { ChevronRight, Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { editMeal, deleteMeal, type EditMealEdit } from "@/actions/meals";

export interface MealCardItem {
  id: string;
  display_name: string;
  food_name: string;
  grams: number;
  kcal: number;
  protein_g: number | null;
  carb_g: number | null;
  fat_g: number | null;
  source: string | null;
  user_edited: boolean;
}

export interface MealCardData {
  id: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack" | null;
  consumed_at: string; // ISO
  total_kcal: number;
  error_band_low: number | null;
  error_band_high: number | null;
  photo_url: string | null;
  label: string;
  items: MealCardItem[];
}

export interface MealCardProps {
  meal: MealCardData;
  readOnly?: boolean;
}

const MEAL_TYPE_LABEL: Record<NonNullable<MealCardData["meal_type"]>, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function MacrosChip({ items }: { items: { protein_g: number | null; carb_g: number | null; fat_g: number | null }[] }) {
  const p = Math.round(items.reduce((a, i) => a + (i.protein_g ?? 0), 0));
  const c = Math.round(items.reduce((a, i) => a + (i.carb_g ?? 0), 0));
  const f = Math.round(items.reduce((a, i) => a + (i.fat_g ?? 0), 0));
  if (p + c + f === 0) return null;
  return (
    <div className="mt-0.5 flex items-center gap-2 text-[10px] font-medium tabular-nums text-[var(--color-text-tertiary)]">
      <span><span className="text-[var(--color-success-green)]">P</span> {p}g</span>
      <span><span className="text-[var(--color-accent-blue)]">C</span> {c}g</span>
      <span><span className="text-[var(--color-spark-orange)]">F</span> {f}g</span>
    </div>
  );
}

function sourceLabel(src: string | null): { text: string; variant: "secondary" | "outline" | "warning" } {
  if (!src) return { text: "Estimated", variant: "warning" };
  if (src === "user_override") return { text: "Recipe", variant: "secondary" };
  if (src === "fatsecret") return { text: "FatSecret", variant: "secondary" };
  if (src === "calorie_ninjas") return { text: "Ninjas", variant: "secondary" };
  if (src === "open_food_facts") return { text: "OFF", variant: "outline" };
  if (src === "gemini_estimate") return { text: "Spark AI", variant: "secondary" };
  // Legacy USDA rows saved before the pipeline change.
  if (src.startsWith("usda")) return { text: "USDA (legacy)", variant: "outline" };
  return { text: src, variant: "outline" };
}

export function MealCard({ meal, readOnly = false }: MealCardProps) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<MealCardItem[]>(meal.items);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const { toast } = useToast();

  // Reset local state whenever the dialog re-opens or props change.
  React.useEffect(() => {
    setItems(meal.items);
  }, [meal.items, open]);

  const totalKcal = Math.round(meal.total_kcal);
  const band =
    meal.error_band_low != null && meal.error_band_high != null
      ? Math.max(
          0,
          Math.round((meal.error_band_high - meal.error_band_low) / 2),
        )
      : null;

  const consumedTime = new Date(meal.consumed_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const onGramsChange = (id: string, gramsStr: string) => {
    const grams = parseFloat(gramsStr);
    if (!Number.isFinite(grams) || grams < 0) return;
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              grams,
              // Optimistic linear rescale for UI only; server recomputes.
              kcal:
                it.grams > 0
                  ? Math.round(((it.kcal * grams) / it.grams) * 10) / 10
                  : it.kcal,
            }
          : it,
      ),
    );
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const edits: EditMealEdit[] = items
        .filter((it) => {
          const original = meal.items.find((o) => o.id === it.id);
          return original && original.grams !== it.grams;
        })
        .map((it) => ({ itemId: it.id, grams: it.grams }));
      if (edits.length === 0) {
        setOpen(false);
        return;
      }
      await editMeal(meal.id, edits);
      toast({ title: "Saved", variant: "success" });
      setOpen(false);
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

  const onDelete = async () => {
    if (!confirm("Delete this meal?")) return;
    setDeleting(true);
    try {
      await deleteMeal(meal.id);
      toast({ title: "Meal deleted", variant: "success" });
      setOpen(false);
    } catch (err) {
      toast({
        title: "Couldn't delete",
        description: err instanceof Error ? err.message : "unknown error",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={cn(
            "group flex w-full items-center gap-3 rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-3 text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]",
          )}
        >
          {meal.photo_url ? (
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--color-surface-muted)]">
              <Image
                src={meal.photo_url}
                alt={meal.label}
                fill
                sizes="56px"
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-muted)] text-2xl">
              {meal.meal_type === "breakfast"
                ? "\u{1F35E}"
                : meal.meal_type === "lunch"
                  ? "\u{1F963}"
                  : meal.meal_type === "dinner"
                    ? "\u{1F37D}"
                    : "\u{1F36A}"}
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">
                {meal.meal_type ? MEAL_TYPE_LABEL[meal.meal_type] : "Meal"}
              </span>
              <span className="text-xs text-[var(--color-text-tertiary)]">·</span>
              <span className="text-xs text-[var(--color-text-tertiary)] tabular-nums">
                {consumedTime}
              </span>
            </div>
            <span className="truncate text-base font-semibold text-[var(--color-text-primary)]">
              {meal.label}
            </span>
            <span className="text-sm text-[var(--color-text-secondary)] tabular-nums">
              {totalKcal} kcal
              {band !== null && band > 0 ? (
                <span className="ml-1 text-[var(--color-text-tertiary)]">
                  ± {band}
                </span>
              ) : null}
            </span>
            <MacrosChip items={items} />
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-[var(--color-text-tertiary)] transition group-hover:translate-x-0.5" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-[var(--color-surface)] p-5 shadow-2xl",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl",
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-[var(--color-text-primary)]">
                {meal.label}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-[var(--color-text-secondary)]">
                {meal.meal_type ? MEAL_TYPE_LABEL[meal.meal_type] : "Meal"} ·{" "}
                {consumedTime}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="rounded-full p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)]"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <ul className="flex flex-col divide-y divide-[var(--color-surface-border)]">
            {items.map((it) => {
              const src = sourceLabel(it.source);
              return (
                <li
                  key={it.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-[var(--color-text-primary)]">
                      {it.display_name}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Badge variant={src.variant} className="text-[10px]">
                        {src.text}
                      </Badge>
                      <span className="text-xs text-[var(--color-text-tertiary)] tabular-nums">
                        {Math.round(it.kcal)} kcal
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="1"
                      min={0}
                      value={it.grams}
                      onChange={(e) => onGramsChange(it.id, e.target.value)}
                      disabled={readOnly}
                      className="h-9 w-20 text-right text-sm tabular-nums"
                    />
                    <span className="text-xs text-[var(--color-text-tertiary)]">g</span>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
              disabled={deleting || saving}
              className="sm:mr-auto"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            {!readOnly ? (
              <Button onClick={onSave} disabled={saving || deleting}>
                <Pencil className="h-4 w-4" />
                {saving ? "Saving…" : "Save changes"}
              </Button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default MealCard;
