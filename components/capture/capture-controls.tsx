"use client";

import * as React from "react";
import {
  Camera,
  Mic,
  MicOff,
  RefreshCw,
  ScanBarcode,
  Send,
  Trash2,
  Type,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { BarcodeScanner } from "./barcode-scanner";

export interface ScannedItem {
  code: string;
  name: string;
  grams: number;
  kcal_per_100g: number;
  protein_per_100g: number;
  carb_per_100g: number;
  fat_per_100g: number;
}

export interface CapturePayload {
  photoBlob: Blob | null;
  audioBlob: Blob | null;
  transcript: string | null;
  typedText: string | null;
  scannedItems: ScannedItem[];
}

export interface CaptureControlsProps {
  disabled?: boolean;
  onSubmit(payload: CapturePayload): void;
}

type Mode = "menu" | "camera" | "voice" | "text" | "scan" | "scan-confirm";

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Downscale an HTMLVideoElement's current frame to JPEG ≤1280px, q=0.8.
 */
async function captureJpegFrame(video: HTMLVideoElement): Promise<Blob> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const MAX = 1280;
  const scale = Math.min(1, MAX / Math.max(vw, vh));
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(video, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob null"))),
      "image/jpeg",
      0.8,
    );
  });
}

export function CaptureControls({ disabled, onSubmit }: CaptureControlsProps) {
  const [mode, setMode] = React.useState<Mode>("menu");

  // Captured artifacts (sticky across mode changes so you can stack inputs).
  const [photoBlob, setPhotoBlob] = React.useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const [audioBlob, setAudioBlob] = React.useState<Blob | null>(null);
  const [transcript, setTranscript] = React.useState<string | null>(null);
  const [typedText, setTypedText] = React.useState<string>("");
  const [scannedItems, setScannedItems] = React.useState<ScannedItem[]>([]);

  // Scan flow staging
  const [pendingScan, setPendingScan] = React.useState<{
    code: string;
    name: string;
    kcal_per_100g: number;
    protein_per_100g: number;
    carb_per_100g: number;
    fat_per_100g: number;
  } | null>(null);
  const [pendingGrams, setPendingGrams] = React.useState<string>("");
  const [scanLookupPending, setScanLookupPending] = React.useState(false);
  const [scanError, setScanError] = React.useState<string | null>(null);

  // Camera state
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [camError, setCamError] = React.useState<string | null>(null);

  // Voice state
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const [recognizing, setRecognizing] = React.useState(false);
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);

  // ---------- Camera ----------
  const startCamera = React.useCallback(async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission denied. Use voice or text instead."
          : err instanceof Error
            ? err.message
            : "camera unavailable";
      setCamError(msg);
    }
  }, []);

  const stopCamera = React.useCallback(() => {
    const s = streamRef.current;
    if (s) {
      for (const track of s.getTracks()) track.stop();
    }
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  React.useEffect(() => {
    if (mode === "camera") {
      void startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [mode, startCamera, stopCamera]);

  React.useEffect(() => {
    // Revoke object URLs to avoid leaks.
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const onShutter = async () => {
    if (!videoRef.current) return;
    try {
      const blob = await captureJpegFrame(videoRef.current);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoBlob(blob);
      setPhotoUrl(URL.createObjectURL(blob));
      setMode("menu");
    } catch (err) {
      setCamError(err instanceof Error ? err.message : "capture failed");
    }
  };

  // ---------- Voice ----------
  const startVoice = React.useCallback(async () => {
    setVoiceError(null);
    setTranscript(null);
    setAudioBlob(null);
    const SR = getSpeechRecognition();
    if (SR) {
      try {
        const rec = new SR();
        rec.lang = navigator.language || "en-US";
        rec.continuous = true;
        rec.interimResults = false;
        rec.onresult = (e) => {
          let final = "";
          for (let i = 0; i < e.results.length; i++) {
            const alt0 = e.results[i]?.[0];
            if (alt0) final += alt0.transcript;
          }
          setTranscript(final.trim() || null);
        };
        rec.onerror = (e) => {
          setVoiceError(e.error ?? e.message ?? "speech recognition failed");
          setRecognizing(false);
        };
        rec.onend = () => setRecognizing(false);
        recognitionRef.current = rec;
        rec.start();
        setRecognizing(true);
        return;
      } catch (err) {
        const m = err instanceof Error ? err.message : "speech recognition failed";
        setVoiceError(m);
      }
    }

    // Fallback: MediaRecorder for audio/webm, server-side Whisper transcribes.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        for (const track of stream.getTracks()) track.stop();
      };
      recorderRef.current = rec;
      rec.start();
      setRecognizing(true);
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission denied. Use text instead."
          : err instanceof Error
            ? err.message
            : "microphone unavailable";
      setVoiceError(msg);
    }
  }, []);

  const stopVoice = React.useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setRecognizing(false);
  }, []);

  React.useEffect(() => () => stopVoice(), [stopVoice]);

  const canSubmit = !!(
    photoBlob ||
    audioBlob ||
    transcript ||
    typedText.trim() ||
    scannedItems.length > 0
  );

  const submit = () => {
    onSubmit({
      photoBlob,
      audioBlob,
      transcript: transcript?.trim() || null,
      typedText: typedText.trim() || null,
      scannedItems,
    });
  };

  const clearAll = () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoBlob(null);
    setPhotoUrl(null);
    setAudioBlob(null);
    setTranscript(null);
    setTypedText("");
    setScannedItems([]);
  };

  // ---------- Scan ----------
  const onBarcodeDetected = async (code: string) => {
    setScanLookupPending(true);
    setScanError(null);
    try {
      const res = await fetch("/api/barcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        if (res.status === 404) {
          setScanError(`No product found for ${code}. Try typing it instead.`);
        } else if (res.status === 401) {
          setScanError("Sign in required to look up products.");
        } else {
          setScanError(`Lookup failed (${res.status}).`);
        }
        setMode("menu");
        return;
      }
      const data = (await res.json()) as {
        ok: true;
        product: {
          name: string;
          code: string;
          kcal_per_100g: number;
          protein_per_100g: number;
          carb_per_100g: number;
          fat_per_100g: number;
        };
      };
      setPendingScan({
        code: data.product.code,
        name: data.product.name,
        kcal_per_100g: data.product.kcal_per_100g,
        protein_per_100g: data.product.protein_per_100g,
        carb_per_100g: data.product.carb_per_100g,
        fat_per_100g: data.product.fat_per_100g,
      });
      setPendingGrams("");
      setMode("scan-confirm");
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Lookup error");
      setMode("menu");
    } finally {
      setScanLookupPending(false);
    }
  };

  const confirmScan = () => {
    if (!pendingScan) return;
    const g = parseFloat(pendingGrams);
    if (!Number.isFinite(g) || g <= 0) return;
    setScannedItems((prev) => [...prev, { ...pendingScan, grams: g }]);
    setPendingScan(null);
    setPendingGrams("");
    setMode("menu");
  };

  const removeScannedItem = (idx: number) => {
    setScannedItems((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-4">
      {scanError ? (
        <div className="rounded-xl bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-ring-red)]">
          {scanError}
        </div>
      ) : null}

      {/* Sticky captured artifacts summary */}
      {photoUrl || transcript || audioBlob || typedText || scannedItems.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-3">
          {photoUrl ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt="Captured meal"
                className="h-14 w-14 rounded-xl object-cover"
              />
              <span className="text-sm text-[var(--color-text-secondary)]">
                Photo ready
              </span>
            </div>
          ) : null}
          {scannedItems.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Scanned ({scannedItems.length})
              </span>
              {scannedItems.map((it, idx) => (
                <div
                  key={`${it.code}-${idx}`}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate">
                    {it.name}{" "}
                    <span className="text-[var(--color-text-secondary)]">
                      — {it.grams}g · {Math.round(it.kcal_per_100g * it.grams / 100)} kcal
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeScannedItem(idx)}
                    className="ml-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-ring-red)]"
                    aria-label="Remove scanned item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {transcript ? (
            <p className="text-sm text-[var(--color-text-primary)]">
              <span className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Heard:
              </span>{" "}
              "{transcript}"
            </p>
          ) : null}
          {audioBlob && !transcript ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Audio recorded ({Math.round(audioBlob.size / 1024)} KB) — we'll
              transcribe on submit.
            </p>
          ) : null}
          {typedText ? (
            <p className="truncate text-sm text-[var(--color-text-primary)]">
              <span className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Typed:
              </span>{" "}
              {typedText}
            </p>
          ) : null}
          <button
            type="button"
            onClick={clearAll}
            className="self-start text-xs text-[var(--color-accent-blue)] hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {mode === "menu" ? (
        <div className="grid grid-cols-4 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setMode("camera")}
            disabled={disabled}
            className="h-24 flex-col gap-1.5"
          >
            <Camera className="h-6 w-6" />
            <span>Photo</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setMode("voice")}
            disabled={disabled}
            className="h-24 flex-col gap-1.5"
          >
            <Mic className="h-6 w-6" />
            <span>Voice</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setMode("text")}
            disabled={disabled}
            className="h-24 flex-col gap-1.5"
          >
            <Type className="h-6 w-6" />
            <span>Text</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setMode("scan")}
            disabled={disabled}
            className="h-24 flex-col gap-1.5"
          >
            <ScanBarcode className="h-6 w-6" />
            <span>Scan</span>
          </Button>
        </div>
      ) : null}

      {mode === "scan" ? (
        <div className="flex flex-col gap-3">
          {scanLookupPending ? (
            <div className="rounded-xl bg-[var(--color-surface-muted)] p-3 text-sm">
              Looking up product…
            </div>
          ) : null}
          <BarcodeScanner
            onDetect={(code) => void onBarcodeDetected(code)}
            onCancel={() => setMode("menu")}
          />
        </div>
      ) : null}

      {mode === "scan-confirm" && pendingScan ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Found
            </p>
            <p className="text-lg font-semibold leading-tight">{pendingScan.name}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {pendingScan.kcal_per_100g} kcal · {pendingScan.protein_per_100g}g P ·{" "}
              {pendingScan.carb_per_100g}g C · {pendingScan.fat_per_100g}g F per 100g
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="grams"
              className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]"
            >
              How much did you eat?
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="grams"
                type="number"
                inputMode="decimal"
                min="0.1"
                step="0.1"
                placeholder="e.g. 30"
                value={pendingGrams}
                onChange={(e) => setPendingGrams(e.target.value)}
                autoFocus
                className="flex-1"
              />
              <span className="text-sm text-[var(--color-text-secondary)]">g</span>
            </div>
            {pendingGrams && parseFloat(pendingGrams) > 0 ? (
              <p className="text-xs text-[var(--color-text-secondary)]">
                ≈ {Math.round((pendingScan.kcal_per_100g * parseFloat(pendingGrams)) / 100)} kcal
              </p>
            ) : null}
          </div>
          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                setPendingScan(null);
                setPendingGrams("");
                setMode("menu");
              }}
              type="button"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmScan}
              disabled={!pendingGrams || parseFloat(pendingGrams) <= 0}
              type="button"
            >
              Add to meal
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "camera" ? (
        <div className="flex flex-col gap-3">
          {camError ? (
            <div className="rounded-xl bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-ring-red)]">
              {camError}
            </div>
          ) : null}
          <div className="relative overflow-hidden rounded-2xl bg-black aspect-[3/4]">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setMode("menu")} type="button">
              <X className="h-4 w-4" /> Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => void startCamera()}
                type="button"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => void onShutter()}
                disabled={!!camError}
                type="button"
                className="px-6"
              >
                <Camera className="h-4 w-4" /> Capture
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {mode === "voice" ? (
        <div className="flex flex-col gap-3">
          {voiceError ? (
            <div className="rounded-xl bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-ring-red)]">
              {voiceError}
            </div>
          ) : null}
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] py-8">
            <button
              type="button"
              onClick={recognizing ? stopVoice : () => void startVoice()}
              className={cn(
                "flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition",
                recognizing
                  ? "bg-[var(--color-ring-red)] animate-pulse"
                  : "bg-[var(--color-spark-orange)]",
              )}
              aria-label={recognizing ? "Stop recording" : "Start recording"}
            >
              {recognizing ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
            </button>
            <span className="text-sm text-[var(--color-text-secondary)]">
              {recognizing
                ? "Listening — tap to stop"
                : "Tap to describe what you ate"}
            </span>
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setMode("menu")} type="button">
              Back
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "text" ? (
        <div className="flex flex-col gap-3">
          <textarea
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            placeholder="e.g. 220g spaghetti with tomato sauce and a 150g grilled chicken breast"
            rows={5}
            className="w-full rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-3 text-base text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]"
          />
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setMode("menu")} type="button">
              Back
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          onClick={submit}
          disabled={!canSubmit || disabled || recognizing}
          size="lg"
        >
          <Send className="h-4 w-4" /> Analyze
        </Button>
      </div>
    </div>
  );
}

export default CaptureControls;
