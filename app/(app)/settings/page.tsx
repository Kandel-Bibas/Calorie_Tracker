import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { ChevronRight, LogOut } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { profiles, goals, integrations } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WithingsSection } from "@/components/withings-section/withings-section";

export const dynamic = "force-dynamic";

/**
 * Group all IANA timezones by continent for an `<optgroup>` dropdown.
 * Uses `Intl.supportedValuesOf('timeZone')` (Node 18+ / modern browsers).
 * Falls back to a curated list if the runtime doesn't support it.
 */
function getTimezoneOptions(): { region: string; zones: string[] }[] {
  const FALLBACK = [
    "UTC",
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "America/Sao_Paulo",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Athens",
    "Africa/Lagos",
    "Africa/Johannesburg",
    "Asia/Dubai",
    "Asia/Karachi",
    "Asia/Kolkata",
    "Asia/Kathmandu",
    "Asia/Dhaka",
    "Asia/Bangkok",
    "Asia/Singapore",
    "Asia/Hong_Kong",
    "Asia/Tokyo",
    "Asia/Seoul",
    "Australia/Perth",
    "Australia/Sydney",
    "Pacific/Auckland",
  ];

  let zones: string[];
  try {
    type IntlWithZones = typeof Intl & {
      supportedValuesOf?: (key: string) => string[];
    };
    const fn = (Intl as IntlWithZones).supportedValuesOf;
    zones = fn ? fn("timeZone") : FALLBACK;
  } catch {
    zones = FALLBACK;
  }

  // Group by the first path segment ("America/Los_Angeles" → "America").
  const groups = new Map<string, string[]>();
  for (const z of zones) {
    const region = z.includes("/") ? z.split("/")[0]! : "Other";
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region)!.push(z);
  }
  // Stable ordering: continent names first, then UTC/Etc at the end.
  const order = [
    "America",
    "Europe",
    "Africa",
    "Asia",
    "Australia",
    "Pacific",
    "Atlantic",
    "Indian",
    "Antarctica",
    "Arctic",
    "Etc",
    "Other",
  ];
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
    .map(([region, zones]) => ({ region, zones: zones.sort() }));
}

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

async function updateProfileAction(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const display_name = (formData.get("display_name") as string | null)?.trim() || null;
  const sex = (formData.get("sex") as string | null) ?? null;
  const birthYearStr = formData.get("birth_year") as string | null;
  const heightStr = formData.get("height_cm") as string | null;
  const units_weight = (formData.get("units_weight") as string | null) ?? "lb";
  const units_height = (formData.get("units_height") as string | null) ?? "ft";
  const timezone = (formData.get("timezone") as string | null) ?? "America/Los_Angeles";

  const birth_year = birthYearStr ? Number(birthYearStr) : null;
  const height_cm = heightStr ? Number(heightStr) : null;

  const db = getDb();
  await db
    .insert(profiles)
    .values({
      id: user.id,
      display_name,
      sex,
      birth_year,
      height_cm,
      units_weight,
      units_height,
      timezone,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        display_name,
        sex,
        birth_year,
        height_cm,
        units_weight,
        units_height,
        timezone,
      },
    });

  redirect("/settings");
}

async function updateTargetAction(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const daily_kcal = Number(formData.get("daily_kcal"));
  if (!Number.isFinite(daily_kcal) || daily_kcal < 800 || daily_kcal > 6000) {
    throw new Error("daily_kcal out of range");
  }
  const reminder_time =
    ((formData.get("reminder_time") as string | null) ?? "").match(/^\d{2}:\d{2}$/)
      ? (formData.get("reminder_time") as string)
      : null;

  const db = getDb();
  // Mark existing active goal as superseded and insert a new one with the
  // updated target. Keep intent/pace/macros from the prior goal.
  const active = await db.query.goals.findFirst({
    where: and(eq(goals.user_id, user.id), isNull(goals.superseded_at)),
  });
  await db.transaction(async (tx) => {
    if (active) {
      await tx
        .update(goals)
        .set({ superseded_at: new Date() })
        .where(eq(goals.id, active.id));
    }
    await tx.insert(goals).values({
      user_id: user.id,
      intent: active?.intent ?? "track",
      target_weight_kg: active?.target_weight_kg ?? null,
      pace: active?.pace ?? null,
      daily_kcal,
      protein_g: active?.protein_g ?? null,
      carb_g: active?.carb_g ?? null,
      fat_g: active?.fat_g ?? null,
      reminder_time,
    });
  });

  redirect("/settings");
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const db = getDb();

  const [profileRow, activeGoal, withingsRow] = await Promise.all([
    db.query.profiles.findFirst({ where: eq(profiles.id, user.id) }),
    db.query.goals.findFirst({
      where: and(eq(goals.user_id, user.id), isNull(goals.superseded_at)),
      orderBy: (g, { desc }) => [desc(g.activated_at)],
    }),
    db.query.integrations.findFirst({
      where: and(eq(integrations.user_id, user.id), eq(integrations.provider, "withings")),
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">
          Settings
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
          {profileRow?.display_name ?? user.email}
        </h1>
        <p className="text-xs text-[var(--color-text-tertiary)]">{user.email}</p>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Profile
        </h2>
        <form action={updateProfileAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              name="display_name"
              defaultValue={profileRow?.display_name ?? ""}
              maxLength={60}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sex">Sex</Label>
              <select
                id="sex"
                name="sex"
                defaultValue={profileRow?.sex ?? "prefer_not"}
                className="flex h-11 w-full rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 text-base"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="prefer_not">Prefer not to say</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="birth_year">Birth year</Label>
              <Input
                id="birth_year"
                name="birth_year"
                type="number"
                min={1900}
                max={new Date().getFullYear() - 5}
                defaultValue={profileRow?.birth_year ?? ""}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="height_cm">Height (cm)</Label>
              <Input
                id="height_cm"
                name="height_cm"
                type="number"
                min={50}
                max={280}
                defaultValue={profileRow?.height_cm ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="timezone">Timezone</Label>
              <select
                id="timezone"
                name="timezone"
                defaultValue={profileRow?.timezone ?? "America/Los_Angeles"}
                className="flex h-11 w-full rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 text-base"
              >
                {getTimezoneOptions().map(({ region, zones }) => (
                  <optgroup key={region} label={region}>
                    {zones.map((z) => (
                      <option key={z} value={z}>
                        {z.split("/").slice(1).join(" / ").replace(/_/g, " ")}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="units_weight">Weight unit</Label>
              <select
                id="units_weight"
                name="units_weight"
                defaultValue={profileRow?.units_weight ?? "lb"}
                className="flex h-11 w-full rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 text-base"
              >
                <option value="lb">lb</option>
                <option value="kg">kg</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="units_height">Height unit</Label>
              <select
                id="units_height"
                name="units_height"
                defaultValue={profileRow?.units_height ?? "ft"}
                className="flex h-11 w-full rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 text-base"
              >
                <option value="ft">ft</option>
                <option value="cm">cm</option>
              </select>
            </div>
          </div>
          <Button type="submit">Save profile</Button>
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Daily target
        </h2>
        <form action={updateTargetAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="daily_kcal">Calories per day</Label>
            <Input
              id="daily_kcal"
              name="daily_kcal"
              type="number"
              min={800}
              max={6000}
              defaultValue={activeGoal?.daily_kcal ?? 2000}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reminder_time">Reminder time (HH:MM, optional)</Label>
            <Input
              id="reminder_time"
              name="reminder_time"
              type="time"
              defaultValue={activeGoal?.reminder_time ?? ""}
            />
          </div>
          <Button type="submit" variant="outline">
            Update target
          </Button>
        </form>
      </section>

      <WithingsSection
        connected={!!withingsRow}
        externalUserId={withingsRow?.external_user_id ?? null}
        lastSyncedAt={withingsRow?.last_synced_at ?? null}
      />

      <Link
        href="/settings/goals"
        className="flex items-center justify-between rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm hover:bg-[var(--color-surface-muted)]"
      >
        <span className="font-medium text-[var(--color-text-primary)]">Goal history</span>
        <ChevronRight className="h-4 w-4 text-[var(--color-text-tertiary)]" />
      </Link>

      <form action={signOut}>
        <Button type="submit" variant="destructive" className="w-full">
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </form>
    </div>
  );
}
