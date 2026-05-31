"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { logWeight } from "@/actions/weights";

export default function AddWeightPage() {
  const router = useRouter();
  const { toast } = useToast();
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = React.useState(todayIso);
  const [weight, setWeight] = React.useState("");
  const [unit, setUnit] = React.useState<"lb" | "kg">("lb");
  const [saving, setSaving] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(weight);
    if (!Number.isFinite(num) || num <= 0) {
      toast({ title: "Enter a valid weight", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const weightKg = unit === "kg" ? num : num / 2.20462;
      await logWeight({
        recordedOn: date,
        weightKg: Math.round(weightKg * 100) / 100,
      });
      toast({ title: "Weight logged", variant: "success" });
      router.push("/weight");
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
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-2">
        <Link
          href="/weight"
          className="rounded-md p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)]"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Add weight</h1>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={date}
            max={todayIso}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="weight">Weight</Label>
          <div className="flex gap-2">
            <Input
              id="weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder={unit === "kg" ? "70.5" : "155.2"}
              required
            />
            <div className="flex rounded-lg border border-[var(--color-surface-border)] p-0.5">
              <button
                type="button"
                onClick={() => setUnit("lb")}
                className={
                  unit === "lb"
                    ? "rounded-md bg-[var(--color-text-primary)] px-3 text-sm font-medium text-[color:var(--color-surface)]"
                    : "px-3 text-sm font-medium text-[var(--color-text-secondary)]"
                }
              >
                lb
              </button>
              <button
                type="button"
                onClick={() => setUnit("kg")}
                className={
                  unit === "kg"
                    ? "rounded-md bg-[var(--color-text-primary)] px-3 text-sm font-medium text-[color:var(--color-surface)]"
                    : "px-3 text-sm font-medium text-[var(--color-text-secondary)]"
                }
              >
                kg
              </button>
            </div>
          </div>
        </div>

        <Button type="submit" disabled={saving} size="lg">
          {saving ? "Saving…" : "Save"}
        </Button>
      </form>
    </div>
  );
}
