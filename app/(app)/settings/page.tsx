import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ChevronRight, LogOut } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { profiles, goals, weights } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateGoal } from "@/actions/goals";
import { mifflinStJeor, applyPaceAdjustment, type ActivityLevel } from "@/lib/goals";
import type { Goal, Intent, Pace } from "@/schemas/goal";
import { SettingsNotices } from "@/components/settings-notices/settings-notices";

const SELECT_CLS =
  "flex h-11 w-full rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 text-base";
const INTENTS = ["lose", "maintain", "gain", "track"] as const;
const PACES = ["easy", "steady", "aggressive"] as const;
const ACTIVITIES = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
] as const;

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
  const units_volume = (formData.get("units_volume") as string | null) ?? "ml";
  const timezone = (formData.get("timezone") as string | null) ?? "America/Los_Angeles";

  const birth_year = birthYearStr ? Number(birthYearStr) : null;
  const height_cm = heightStr ? Number(heightStr) : null;
  const waterGoalStr = formData.get("water_goal_ml") as string | null;
  const water_goal_ml = waterGoalStr
    ? Math.max(250, Math.min(6000, Math.round(Number(waterGoalStr))))
    : 2000;

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
      units_volume,
      water_goal_ml,
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
        units_volume,
        water_goal_ml,
        timezone,
      },
    });

  redirect("/settings");
}

async function updateGoalAction(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  const db = getDb();

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, user.id),
  });
  const unitsWeight = profile?.units_weight === "kg" ? "kg" : "lb";

  const intentRaw = String(formData.get("intent") ?? "maintain");
  const intent: Intent = (INTENTS as readonly string[]).includes(intentRaw)
    ? (intentRaw as Intent)
    : "maintain";
  const paceRaw = String(formData.get("pace") ?? "steady");
  const pace: Pace = (PACES as readonly string[]).includes(paceRaw)
    ? (paceRaw as Pace)
    : "steady";
  const activityRaw = String(formData.get("activity_level") ?? "sedentary");
  const activity: ActivityLevel = (ACTIVITIES as readonly string[]).includes(activityRaw)
    ? (activityRaw as ActivityLevel)
    : "sedentary";

  // Goal weight (entered in display units) → kg. Optional.
  let target_weight_kg: number | undefined;
  const gwRaw = formData.get("goal_weight");
  if (typeof gwRaw === "string" && gwRaw.trim()) {
    const gw = Number(gwRaw);
    if (Number.isFinite(gw) && gw > 0) {
      const kg = unitsWeight === "kg" ? gw : gw / 2.20462;
      target_weight_kg = Math.max(20, Math.min(300, Math.round(kg * 100) / 100));
    }
  }

  // Optional manual calorie override.
  let daily_kcal: number | undefined;
  const kcalRaw = formData.get("daily_kcal");
  if (typeof kcalRaw === "string" && kcalRaw.trim()) {
    const k = Number(kcalRaw);
    if (Number.isFinite(k) && k >= 800 && k <= 6000) daily_kcal = Math.round(k);
  }

  // No override → compute from Mifflin-St Jeor × activity, then pace adjustment.
  if (daily_kcal == null) {
    const latest = await db.query.weights.findFirst({
      where: eq(weights.user_id, user.id),
      orderBy: [desc(weights.recorded_on)],
    });
    if (profile?.sex && profile.birth_year && profile.height_cm && latest) {
      const age = new Date().getFullYear() - profile.birth_year;
      const tdee = mifflinStJeor({
        sex: profile.sex as "male" | "female" | "prefer_not",
        age,
        height_cm: profile.height_cm,
        weight_kg: Number(latest.weight_kg),
        activity,
      });
      daily_kcal = applyPaceAdjustment(tdee, intent, pace);
    } else {
      // Not enough profile/weight data to compute — keep the current target.
      const active = await db.query.goals.findFirst({
        where: and(eq(goals.user_id, user.id), isNull(goals.superseded_at)),
      });
      daily_kcal = active?.daily_kcal ?? 2000;
    }
  }

  // Persist the chosen activity level on the profile.
  await db.update(profiles).set({ activity_level: activity }).where(eq(profiles.id, user.id));

  // Supersede the active goal and insert the new one (recomputes macros +
  // busts the active-goal cache).
  const goalInput: Goal = {
    intent,
    target_weight_kg,
    pace: intent === "maintain" || intent === "track" ? undefined : pace,
    daily_kcal,
  };
  await updateGoal(goalInput);

  // If they picked a non-default pace on a maintain/track goal, pace was
  // dropped (no maintenance-calorie adjustment) — flag it so the page can
  // explain via a toast.
  const paceDropped =
    (intent === "maintain" || intent === "track") && pace !== "steady";
  redirect(paceDropped ? "/settings?notice=pace-na" : "/settings");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const db = getDb();

  const [profileRow, activeGoal] = await Promise.all([
    db.query.profiles.findFirst({ where: eq(profiles.id, user.id) }),
    db.query.goals.findFirst({
      where: and(eq(goals.user_id, user.id), isNull(goals.superseded_at)),
      orderBy: (g, { desc }) => [desc(g.activated_at)],
    }),
  ]);

  const weightUnit = profileRow?.units_weight === "kg" ? "kg" : "lb";
  const goalWeightDisplay =
    activeGoal?.target_weight_kg != null
      ? String(
          Math.round(
            (weightUnit === "kg"
              ? Number(activeGoal.target_weight_kg)
              : Number(activeGoal.target_weight_kg) * 2.20462) * 10,
          ) / 10,
        )
      : "";

  return (
    <div className="flex flex-col gap-6">
      <SettingsNotices notice={notice} />
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
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="units_volume">Water unit</Label>
              <select
                id="units_volume"
                name="units_volume"
                defaultValue={profileRow?.units_volume ?? "ml"}
                className="flex h-11 w-full rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 text-base"
              >
                <option value="ml">ml / L</option>
                <option value="oz">fl oz</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="water_goal_ml">Daily water goal (ml)</Label>
              <Input
                id="water_goal_ml"
                name="water_goal_ml"
                type="number"
                min={250}
                max={6000}
                step={50}
                defaultValue={profileRow?.water_goal_ml ?? 2000}
              />
            </div>
          </div>
          <Button type="submit">Save profile</Button>
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Goal
        </h2>
        <form action={updateGoalAction} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="intent">Goal</Label>
              <select
                id="intent"
                name="intent"
                defaultValue={activeGoal?.intent ?? "maintain"}
                className={SELECT_CLS}
              >
                <option value="lose">Lose weight</option>
                <option value="maintain">Maintain</option>
                <option value="gain">Gain weight</option>
                <option value="track">Just track</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal_weight">Goal weight ({weightUnit})</Label>
              <Input
                id="goal_weight"
                name="goal_weight"
                type="number"
                step="0.1"
                min={20}
                max={660}
                defaultValue={goalWeightDisplay}
                placeholder="optional"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pace">Pace</Label>
              <select
                id="pace"
                name="pace"
                defaultValue={activeGoal?.pace ?? "steady"}
                className={SELECT_CLS}
              >
                <option value="easy">Easy</option>
                <option value="steady">Steady</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="activity_level">Activity</Label>
              <select
                id="activity_level"
                name="activity_level"
                defaultValue={profileRow?.activity_level ?? "sedentary"}
                className={SELECT_CLS}
              >
                <option value="sedentary">Sedentary</option>
                <option value="light">Lightly active</option>
                <option value="moderate">Moderately active</option>
                <option value="active">Very active</option>
                <option value="very_active">Extra active</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="daily_kcal">Calories per day</Label>
            <Input
              id="daily_kcal"
              name="daily_kcal"
              type="number"
              min={800}
              max={6000}
              placeholder={`Auto · currently ${activeGoal?.daily_kcal ?? 2000} kcal`}
            />
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Leave blank to auto-calculate from your goal, pace &amp; activity.
              Enter a number to override.
            </p>
          </div>
          <Button type="submit" variant="outline">
            Update goal
          </Button>
        </form>
      </section>

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
