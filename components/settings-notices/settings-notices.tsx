"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/ui/toast";

/**
 * Fires a one-shot toast for a `?notice=` flag set by a Settings server action
 * (which can't show a toast itself before it redirects). Reads the flag from a
 * prop (server-passed searchParams), shows the matching message once, then
 * cleans the URL so a refresh doesn't re-toast.
 */
const MESSAGES: Record<string, { title: string; description: string }> = {
  "pace-na": {
    title: "Pace wasn't applied",
    description:
      "A “maintain” or “track” goal keeps you at maintenance calories, so pace has no effect. Switch to Lose or Gain to use it.",
  },
};

export function SettingsNotices({ notice }: { notice?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const firedRef = React.useRef(false);

  React.useEffect(() => {
    if (firedRef.current || !notice) return;
    const msg = MESSAGES[notice];
    if (!msg) return;
    firedRef.current = true;
    toast({ title: msg.title, description: msg.description });
    // Strip the query param so a refresh doesn't replay the toast.
    router.replace("/settings");
  }, [notice, toast, router]);

  return null;
}
