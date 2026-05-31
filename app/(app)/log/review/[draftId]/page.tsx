import { notFound } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";

import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { mealDrafts } from "@/db/schema";
import { ItemsTable, type DraftItemForTable } from "@/components/meal-review/items-table";

interface DraftData {
  meal_label: string;
  notes?: string;
  items: DraftItemForTable[];
  totals: {
    kcal: number;
    protein_g: number;
    carb_g: number;
    fat_g: number;
    error_band_low: number;
    error_band_high: number;
  };
  photo_path: string | null;
  transcript: string | null;
}

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ draftId: string }>;
}

export default async function ReviewPage({ params }: PageProps) {
  const { draftId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    notFound();
  }

  const db = getDb();
  const now = new Date();
  const draft = await db.query.mealDrafts.findFirst({
    where: and(
      eq(mealDrafts.id, draftId),
      eq(mealDrafts.user_id, user.id),
      gt(mealDrafts.expires_at, now),
    ),
  });
  if (!draft) {
    notFound();
  }
  const data = draft.draft_data as DraftData;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">
          Review
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
          Looks right?
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Tweak the grams or names before saving. Spark only learns from
          confirmed meals.
        </p>
      </header>

      {data.transcript ? (
        <div className="rounded-2xl bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-secondary)] shadow-sm">
          <span className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Heard:
          </span>{" "}
          "{data.transcript}"
        </div>
      ) : null}

      <ItemsTable
        draftId={draftId}
        items={data.items}
        totals={data.totals}
        mealLabel={data.meal_label}
      />
    </div>
  );
}
