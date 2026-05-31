"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { integrations } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  return user.id;
}

export async function disconnectWithings(): Promise<void> {
  const userId = await requireUserId();
  const db = getDb();
  await db
    .delete(integrations)
    .where(and(eq(integrations.user_id, userId), eq(integrations.provider, "withings")));
  revalidatePath("/settings");
  revalidatePath("/today");
}
