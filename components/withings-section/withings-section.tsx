"use client";

import * as React from "react";
import { Activity, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { disconnectWithings } from "@/actions/withings";

export interface WithingsSectionProps {
  /** Pass null when the integration row doesn't exist yet. */
  connected: boolean;
  externalUserId: string | null;
  lastSyncedAt: Date | null;
}

/**
 * UI controls for the Withings integration: connect, sync, disconnect.
 * The connect action is a plain anchor to /api/withings/auth which initiates
 * OAuth. Sync triggers POST /api/withings/sync. Disconnect calls a Server
 * Action that wipes the integration row.
 */
export function WithingsSection({ connected, externalUserId, lastSyncedAt }: WithingsSectionProps) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);

  async function handleSync() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/withings/sync", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        activity_days?: number;
        weight_readings?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast({
          title: "Sync failed",
          description: data.error ?? `HTTP ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Synced",
        description: `${data.activity_days ?? 0} activity days · ${data.weight_readings ?? 0} weight readings`,
      });
      // RSC refresh
      window.location.reload();
    } catch (err) {
      toast({
        title: "Sync error",
        description: err instanceof Error ? err.message : "unknown",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  async function handleDisconnect() {
    if (pending) return;
    if (!confirm("Disconnect Withings? Synced data stays — only the auth tokens are removed.")) return;
    setPending(true);
    try {
      await disconnectWithings();
      window.location.reload();
    } catch (err) {
      toast({
        title: "Disconnect failed",
        description: err instanceof Error ? err.message : "unknown",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  if (!connected) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Integrations
          </h2>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-surface-border)] p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-surface-muted)]">
              <Activity className="h-5 w-5 text-[var(--color-accent-blue)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Withings</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Steps, calories burned, weight (pulls from Apple Health via Withings)
              </p>
            </div>
          </div>
          <Button asChild size="sm">
            <a href="/api/withings/auth">Connect</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
        Integrations
      </h2>
      <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-surface-border)] p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-success-green)]/15">
            <Activity className="h-5 w-5 text-[var(--color-success-green)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Withings · connected</p>
            <p className="text-xs text-[var(--color-text-secondary)] tabular-nums">
              User {externalUserId ?? "—"} ·{" "}
              {lastSyncedAt
                ? `Last synced ${formatRelative(lastSyncedAt)}`
                : "Not synced yet"}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDisconnect}
            disabled={pending}
            type="button"
          >
            <Trash2 className="h-4 w-4" /> Disconnect
          </Button>
          <Button size="sm" onClick={handleSync} disabled={pending} type="button">
            <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />{" "}
            {pending ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
