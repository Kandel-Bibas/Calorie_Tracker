"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { saveRecipe } from "@/actions/recipes";
import type { RecipeIngredient } from "@/schemas/recipe";

export interface RecipeBuilderProps {
  initial?: {
    display_name: string;
    ingredients: RecipeIngredient[];
  };
}

interface IngredientRow {
  display_name: string;
  usda_query: string;
  grams: number;
}

export function RecipeBuilder({ initial }: RecipeBuilderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = React.useState(initial?.display_name ?? "");
  const [rows, setRows] = React.useState<IngredientRow[]>(
    initial?.ingredients?.length
      ? initial.ingredients.map((i) => ({
          display_name: i.display_name,
          usda_query: i.usda_query,
          grams: i.grams,
        }))
      : [{ display_name: "", usda_query: "", grams: 100 }],
  );
  const [saving, setSaving] = React.useState(false);

  const totalGrams = rows.reduce((a, r) => a + (Number.isFinite(r.grams) ? r.grams : 0), 0);

  const updateRow = (idx: number, patch: Partial<IngredientRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () =>
    setRows((prev) => [...prev, { display_name: "", usda_query: "", grams: 100 }]);

  const removeRow = (idx: number) =>
    setRows((prev) => prev.filter((_, i) => i !== idx));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: "Add a recipe name", variant: "destructive" });
      return;
    }
    const ingredients = rows
      .map((r) => ({
        display_name: r.display_name.trim(),
        usda_query: r.usda_query.trim() || r.display_name.trim(),
        grams: Number(r.grams),
      }))
      .filter((r) => r.display_name && r.grams > 0);
    if (ingredients.length === 0) {
      toast({ title: "Add at least one ingredient", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await saveRecipe({ display_name: trimmedName, ingredients });
      toast({ title: "Recipe saved", variant: "success" });
      router.push("/recipes");
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

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recipe-name">Recipe name</Label>
        <Input
          id="recipe-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mom's daal"
          maxLength={80}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Ingredients</Label>
          <span className="text-xs text-[var(--color-text-tertiary)] tabular-nums">
            Total: {Math.round(totalGrams)} g
          </span>
        </div>
        <ul className="flex flex-col divide-y divide-[var(--color-surface-border)] rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)]">
          {rows.map((r, i) => (
            <li key={i} className="flex flex-col gap-2 p-3">
              <Input
                value={r.display_name}
                onChange={(e) => updateRow(i, { display_name: e.target.value })}
                placeholder="Ingredient name (e.g. red lentils)"
                className="h-9"
              />
              <div className="flex gap-2">
                <Input
                  value={r.usda_query}
                  onChange={(e) => updateRow(i, { usda_query: e.target.value })}
                  placeholder="USDA query (auto)"
                  className="h-9 flex-1 text-sm"
                />
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    min={0.1}
                    value={r.grams}
                    onChange={(e) =>
                      updateRow(i, { grams: parseFloat(e.target.value) || 0 })
                    }
                    className="h-9 w-20 text-right text-sm tabular-nums"
                  />
                  <span className="text-xs text-[var(--color-text-tertiary)]">g</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  aria-label="Remove ingredient"
                  className="rounded-md p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ring-red)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={addRow}
              className="flex w-full items-center justify-center gap-1.5 p-3 text-sm font-medium text-[var(--color-accent-blue)] hover:bg-[var(--color-surface-muted)]"
            >
              <Plus className="h-4 w-4" /> Add ingredient
            </button>
          </li>
        </ul>
      </div>

      <Button type="submit" disabled={saving} size="lg">
        {saving ? "Saving…" : "Save recipe"}
      </Button>
    </form>
  );
}

export default RecipeBuilder;
