"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Live barcode scanner.
 *
 * Two backends, picked in order:
 *   1. Native `BarcodeDetector` API (Chrome / Edge / Android Chrome)
 *   2. `@zxing/browser` WebAssembly decoder (Safari, iOS, Brave, Firefox, everything else)
 *
 * Continuously samples frames from the back camera and fires `onDetect`
 * with the first valid code.
 */

interface BarcodeDetectionResult {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): {
    detect(
      source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    ): Promise<BarcodeDetectionResult[]>;
  };
}

function getNativeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "qr_code",
];

export interface BarcodeScannerProps {
  onDetect(code: string): void;
  onCancel(): void;
}

export function BarcodeScanner({ onDetect, onCancel }: BarcodeScannerProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const stoppedRef = React.useRef(false);
  const zxingControlsRef = React.useRef<{ stop(): void } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const native = getNativeDetector();
    let raf = 0;

    const startCamera = async (): Promise<MediaStream | null> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        return stream;
      } catch (err) {
        setError(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera permission denied."
            : err instanceof Error
              ? err.message
              : "Camera unavailable.",
        );
        return null;
      }
    };

    const runNative = (detector: ReturnType<BarcodeDetectorCtor["prototype"]["constructor"] extends never ? never : never> extends never ? InstanceType<BarcodeDetectorCtor> : never) => {
      const loop = () => {
        raf = requestAnimationFrame(async () => {
          if (stoppedRef.current || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            const hit = results.find((r) => r.rawValue && r.rawValue.length >= 6);
            if (hit) {
              stoppedRef.current = true;
              onDetect(hit.rawValue);
              return;
            }
          } catch {
            /* keep looping */
          }
          loop();
        });
      };
      loop();
    };

    const runZxing = async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (stoppedRef.current || !videoRef.current) return;
        const reader = new BrowserMultiFormatReader();
        // decodeFromVideoElement loops internally and re-uses our existing stream.
        const controls = await reader.decodeFromVideoElement(
          videoRef.current,
          (result) => {
            if (stoppedRef.current || !result) return;
            const text = result.getText();
            if (text && text.length >= 6) {
              stoppedRef.current = true;
              controls.stop();
              onDetect(text);
            }
          },
        );
        zxingControlsRef.current = controls;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Scanner failed to load.");
      }
    };

    (async () => {
      const stream = await startCamera();
      if (!stream || stoppedRef.current) return;

      if (native) {
        // Type assertion: we already null-checked.
        const detector = new native({ formats: NATIVE_FORMATS });
        runNative(detector as unknown as Parameters<typeof runNative>[0]);
      } else {
        await runZxing();
      }
    })();

    return () => {
      stoppedRef.current = true;
      cancelAnimationFrame(raf);
      if (zxingControlsRef.current) {
        try {
          zxingControlsRef.current.stop();
        } catch {
          /* ignore */
        }
        zxingControlsRef.current = null;
      }
      const s = streamRef.current;
      if (s) {
        for (const t of s.getTracks()) t.stop();
      }
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <div className="rounded-xl bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-ring-red)]">
          {error}
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
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-1/3 w-4/5 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
        </div>
        <p className="absolute left-0 right-0 bottom-4 text-center text-xs font-medium text-white/85">
          Point at a barcode to scan
        </p>
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onCancel} type="button">
          <X className="h-4 w-4" /> Cancel
        </Button>
      </div>
    </div>
  );
}

export default BarcodeScanner;
