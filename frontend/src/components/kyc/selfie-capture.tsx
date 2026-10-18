// src/components/kyc/selfie-capture.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Check,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
  User,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/surfaces";
import { cn } from "@/lib/utils";

type Mode = "intro" | "camera" | "fallback";

export interface SelfieCaptureProps {
  value: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}

/**
 * Selfie capture with camera-first UX and file-input fallback.
 */
export function SelfieCapture({ value, onChange, disabled }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("intro");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // ---- stream lifecycle -------------------------------------------------

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  // Attach the stream *after* the video element mounts
  useEffect(() => {
    if (mode === "camera" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {
        /* autoplay might be blocked; user can tap the video */
      });
    }
  }, [mode]);

  // ---- preview URL lifecycle -------------------------------------------

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  // ---- camera -----------------------------------------------------------

  const startCamera = useCallback(async () => {
    setError(null);
    setStarting(true);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStarting(false);
      setMode("fallback");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setMode("camera");
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError")
      ) {
        setError(
          "Camera access is blocked. You can still upload a selfie photo below.",
        );
      }
      setMode("fallback");
    } finally {
      setStarting(false);
    }
  }, []);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setError("The camera hasn't started yet. Try again in a moment.");
      return;
    }

    setCapturing(true);
    // slight delay for UX (makes the shutter feel deliberate)
    await new Promise((r) => setTimeout(r, 150));

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Couldn't capture the photo. Please try again.");
      setCapturing(false);
      return;
    }

    // Mirror horizontally to match the live preview
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    setCapturing(false);

    if (!blob) {
      setError("Couldn't capture the photo. Please try again.");
      return;
    }

    stopStream();
    onChange(
      new File([blob], `selfie-${Date.now()}.jpg`, { type: "image/jpeg" }),
    );
  }, [onChange, stopStream]);

  const retake = useCallback(() => {
    onChange(null);
    setError(null);
    void startCamera();
  }, [onChange, startCamera]);

  const clear = useCallback(() => {
    onChange(null);
    setError(null);
    stopStream();
    setMode("intro");
  }, [onChange, stopStream]);

  const handleFallbackFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("Please choose an image file.");
        return;
      }
      setError(null);
      onChange(file);
    },
    [onChange],
  );

  // ---- render -----------------------------------------------------------

  if (value && previewUrl) {
    return (
      <div className="flex flex-col items-center space-y-4">
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-black shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Your selfie"
            className="block max-h-[400px] w-auto object-contain"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={retake} disabled={disabled}>
            <RefreshCw className="size-3.5" />
            Retake
          </Button>
          <Button variant="ghost" onClick={clear} disabled={disabled}>
            <X className="size-3.5" />
            Remove
          </Button>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-[var(--success)]">
          <Check className="size-3.5" strokeWidth={3} />
          Selfie ready
        </p>
      </div>
    );
  }

  if (mode === "intro") {
    return (
      <div className="flex flex-col items-center space-y-5">
        <div className="flex w-full max-w-md flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-10 py-14 text-center">
          <div className="mb-4 grid size-20 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
            <User className="size-10" strokeWidth={1.5} />
          </div>
          <p className="mb-1 text-base font-bold">Ready to take your selfie</p>
          <p className="text-sm text-[var(--muted)]">
            We&apos;ll compare this photo to the one on your document. Nothing
            leaves your device until you submit.
          </p>
        </div>

        {error && (
          <Alert tone="warning" title="Camera unavailable" className="w-full max-w-md">
            {error}
          </Alert>
        )}

        <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            onClick={startCamera}
            loading={starting}
            disabled={disabled}
            className="w-full sm:w-auto"
          >
            <Camera className="size-4" />
            Start camera
          </Button>
          <Button
            variant="outline"
            onClick={() => setMode("fallback")}
            disabled={disabled}
            className="w-full sm:w-auto"
          >
            <Upload className="size-4" />
            Upload a photo
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "camera") {
    return (
      <div className="flex flex-col items-center space-y-6">
        <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-black shadow-lg">
          {/* The actual video element, flipped for mirror effect */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="block aspect-[3/4] w-full scale-x-[-1] object-cover"
          />

          {/* Overlay: face guide + dimming */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[55%] w-[65%] rounded-[50%] border-[3px] border-dashed border-white/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
          </div>

          {/* Status / Error overlay */}
          {error && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4">
              <p className="text-center text-xs text-white">{error}</p>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {/* Shutter button row */}
        <div className="flex items-center justify-between w-full max-w-sm px-4">
          <Button
            variant="ghost"
            onClick={clear}
            disabled={disabled || capturing}
          >
            Cancel
          </Button>

          <button
            type="button"
            onClick={capture}
            disabled={disabled || capturing}
            className={cn(
              "relative grid size-20 place-items-center rounded-full border-4 border-[var(--border)] bg-white transition-transform active:scale-95 disabled:cursor-wait disabled:opacity-50",
            )}
            aria-label="Take photo"
          >
            <span
              className={cn(
                "block size-14 rounded-full bg-[var(--primary)] transition-colors",
                capturing && "bg-[var(--muted)]",
              )}
            />
            {capturing && (
              <Loader2 className="absolute size-6 animate-spin text-white" />
            )}
          </button>

          <div className="w-16" /> {/* spacer to balance the flex layout */}
        </div>

        <p className="max-w-xs text-center text-xs text-[var(--muted)]">
          Look directly at the camera. Remove glasses or hats. Find even lighting.
        </p>
      </div>
    );
  }

  // Fallback mode
  return (
    <div className="flex flex-col items-center space-y-4">
      <div
        className="flex w-full max-w-md cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border-hi)] bg-[var(--surface-2)] px-8 py-12 text-center transition-colors hover:bg-[var(--surface-hi)]"
        onClick={() => fileInputRef.current?.click()}
      >
        <CameraOff className="mb-3 size-10 text-[var(--muted)]" strokeWidth={1.5} />
        <p className="mb-1 text-base font-bold">Upload a selfie</p>
        <p className="mb-5 max-w-[250px] text-sm text-[var(--muted)]">
          Take a photo of yourself in good lighting. Your whole face must be clearly lit.
        </p>
        <Button className="pointer-events-none">
          <Upload className="size-4" />
          Choose photo
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="user"
          className="hidden"
          onChange={(e) => handleFallbackFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {error && (
        <Alert tone="warning" className="w-full max-w-md">
          {error}
        </Alert>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setError(null);
          setMode("intro");
        }}
      >
        Try camera again
      </Button>
    </div>
  );
}
