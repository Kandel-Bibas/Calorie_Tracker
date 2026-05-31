/**
 * Pending capture handoff — used to carry an in-progress meal capture
 * across magic-link sign-in. The user starts capturing in /onboarding/first-meal
 * (unauthenticated), we stash the photo/voice/text here, redirect through /login,
 * and /log picks it up on mount post-auth.
 *
 * We use `localStorage` (not session) because the magic-link click typically
 * opens a fresh Safari tab, so session-scoped storage isn't visible.
 *
 * Blobs are encoded as data: URLs (base64). A downscaled meal photo is
 * ~250 KB, ~333 KB base64 — well within localStorage's 5–10 MB quota.
 */

const KEY = "pending_capture_v1";
const TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface PendingCapture {
  photoDataUrl: string | null;
  audioDataUrl: string | null;
  transcript: string | null;
  typedText: string | null;
  stashedAt: number;
}

export interface CaptureInput {
  photoBlob: Blob | null;
  audioBlob: Blob | null;
  transcript: string | null;
  typedText: string | null;
  scannedItems?: Array<{
    code: string;
    name: string;
    grams: number;
    kcal_per_100g: number;
    protein_per_100g: number;
    carb_per_100g: number;
    fat_per_100g: number;
  }>;
}

export async function stashPendingCapture(p: CaptureInput): Promise<void> {
  if (typeof window === "undefined") return;
  const data: PendingCapture = {
    photoDataUrl: p.photoBlob ? await blobToDataUrl(p.photoBlob) : null,
    audioDataUrl: p.audioBlob ? await blobToDataUrl(p.audioBlob) : null,
    transcript: p.transcript,
    typedText: p.typedText,
    stashedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // localStorage quota or private-mode failure — swallow.
  }
}

export function loadPendingCapture(): PendingCapture | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingCapture;
    // Expire ancient drafts.
    if (Date.now() - parsed.stashedAt > TTL_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingCapture(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export async function pendingToPayload(p: PendingCapture): Promise<CaptureInput> {
  return {
    photoBlob: p.photoDataUrl ? await dataUrlToBlob(p.photoDataUrl) : null,
    audioBlob: p.audioDataUrl ? await dataUrlToBlob(p.audioDataUrl) : null,
    transcript: p.transcript,
    typedText: p.typedText,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}
