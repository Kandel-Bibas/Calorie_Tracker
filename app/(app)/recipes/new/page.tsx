import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { RecipeBuilder } from "@/components/recipe-builder/recipe-builder";

export default function NewRecipePage() {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-2">
        <Link
          href="/recipes"
          className="rounded-md p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)]"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">New recipe</h1>
      </header>
      <RecipeBuilder />
    </div>
  );
}
