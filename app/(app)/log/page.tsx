"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { CaptureControls, type CapturePayload } from "@/components/capture";
import { Spark } from "@/components/spark";
import { Button } from "@/components/ui/button";
import {
  loadPendingCapture,
  clearPendingCapture,
  pendingToPayload,
} from "@/lib/pending-capture";

type State =
  | { kind: "IDLE" }
  | { kind: "ANALYZING"; status: string }
  | { kind: "ERROR"; message: string };

type Action =
  | { type: "START" }
  | { type: "STATUS"; message: string }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "START":
      return { kind: "ANALYZING", status: "Uploading…" };
    case "STATUS":
      return { kind: "ANALYZING", status: action.message };
    case "ERROR":
      return { kind: "ERROR", message: action.message };
    case "RESET":
      return { kind: "IDLE" };
    default:
      return state;
  }
}

/**
 * Streams NDJSON chunks from /api/analyze, yielding parsed objects. The route
 * sends one JSON object per line; chunks may straddle line boundaries.
 */
async function* readNdjson(
  response: Response,
): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        yield JSON.parse(line) as Record<string, unknown>;
      } catch {
        // ignore malformed line
      }
    }
  }
  const last = buffer.trim();
  if (last) {
    try {
      yield JSON.parse(last) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
}

export default function LogPage() {
  const [state, dispatch] = React.useReducer(reducer, { kind: "IDLE" });
  const router = useRouter();
  const claimRef = React.useRef(false);

  const handleSubmit = async (payload: CapturePayload) => {
    dispatch({ type: "START" });
    try {
      const fd = new FormData();
      if (payload.photoBlob) fd.set("photo", payload.photoBlob, "meal.jpg");
      if (payload.audioBlob) fd.set("audio", payload.audioBlob, "voice.webm");
      if (payload.transcript) fd.set("transcript", payload.transcript);
      if (payload.typedText) fd.set("typed_text", payload.typedText);
      if (payload.scannedItems && payload.scannedItems.length > 0) {
        fd.set("scanned_items", JSON.stringify(payload.scannedItems));
      }

      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        let serverMsg = errText;
        try {
          const parsed = JSON.parse(errText) as { error?: string };
          if (parsed?.error) serverMsg = parsed.error;
        } catch {
          // body wasn't JSON — keep the raw text
        }
        dispatch({
          type: "ERROR",
          message:
            serverMsg ||
            (res.status === 429
              ? "You're adding meals too fast. Please try again later."
              : `Request failed (${res.status})`),
        });
        return;
      }

      let draftId: string | null = null;
      for await (const chunk of readNdjson(res)) {
        const type = chunk["type"];
        if (type === "status" && typeof chunk["message"] === "string") {
          dispatch({ type: "STATUS", message: chunk["message"] });
        } else if (type === "draft" && typeof chunk["draftId"] === "string") {
          draftId = chunk["draftId"];
          break;
        } else if (type === "error" && typeof chunk["message"] === "string") {
          dispatch({ type: "ERROR", message: chunk["message"] });
          return;
        }
      }

      if (draftId) {
        router.push(`/log/review/${draftId}`);
      } else {
        dispatch({ type: "ERROR", message: "No draft was produced. Try again." });
      }
    } catch (err) {
      dispatch({
        type: "ERROR",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  };

  // Auto-submit a capture stashed from onboarding (pre-auth), if present.
  React.useEffect(() => {
    if (claimRef.current) return;
    claimRef.current = true;
    const pending = loadPendingCapture();
    if (!pending) return;
    clearPendingCapture();
    (async () => {
      const payload = await pendingToPayload(pending);
      await handleSubmit({ ...payload, scannedItems: payload.scannedItems ?? [] });
    })().catch((err) => {
      dispatch({
        type: "ERROR",
        message: err instanceof Error ? err.message : "Failed to load capture",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
          Log a meal
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Snap, speak, or type. Spark will identify the foods and look up the
          numbers.
        </p>
      </header>

      {state.kind === "IDLE" ? (
        <CaptureControls onSubmit={handleSubmit} />
      ) : null}

      {state.kind === "ANALYZING" ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl bg-[var(--color-surface)] py-10 shadow-sm">
          <Spark variant="thinking" size={112} />
          <p className="text-base font-medium text-[var(--color-text-primary)]">
            {state.status}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            This usually takes 2–6 seconds.
          </p>
        </div>
      ) : null}

      {state.kind === "ERROR" ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-[var(--color-ring-red)]/30 bg-[var(--color-surface)] py-8 px-5 text-center shadow-sm">
          <Spark variant="wobble" size={96} />
          <p className="text-base font-medium text-[var(--color-text-primary)]">
            Something went wrong
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {state.message}
          </p>
          <Button onClick={() => dispatch({ type: "RESET" })}>Try again</Button>
        </div>
      ) : null}
    </div>
  );
}
