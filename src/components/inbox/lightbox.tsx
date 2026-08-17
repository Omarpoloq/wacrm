"use client";

import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type MediaType = "image" | "video";

interface LightboxProps {
  /** Resolved media URL (may be a blob: URL produced by the parent). */
  src: string;
  /** Accessible description of the media; also used as aria-label. */
  alt: string;
  /** Type of media to render. */
  mediaType?: MediaType;
  /** Controlled open state. */
  open: boolean;
  /** Called when the user requests dismissal (button, click-outside, Escape). */
  onClose: () => void;
  /** Localized label for the close button. */
  closeLabel: string;
}

/**
 * Fullscreen media viewer for chat bubbles (Instagram-DM style).
 * Supports both images and videos.
 *
 * - Renders into a fixed overlay that covers the viewport.
 * - Closes on overlay click, X button, and Escape.
 * - Locks body scroll while open and restores it on close.
 * - Pulls focus into the dialog on open and returns it to the trigger on close.
 *
 * Note: We don't reuse the generic `Dialog` component because that one is
 * tuned for a centered popover surface — wrong shape for a full-bleed media
 * viewer. The portal/overlay/backdrop here are bespoke.
 */
export function Lightbox({ src, alt, mediaType = "image", open, onClose, closeLabel }: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  // Element that had focus before we opened, so we can hand it back on close.
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Lock body scroll while the lightbox is mounted so the page underneath
  // doesn't drift when the user scrolls over the overlay. We restore the
  // previous overflow value (not just '' ) in case the page had set it
  // for some reason before we mounted.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Escape key + initial focus + focus restore.
  useEffect(() => {
    if (!open) return;

    lastFocusedRef.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // Focus the close button on the next tick so the DOM has settled.
    const focusTimer = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 0);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      // Hand focus back to whatever the user was interacting with.
      lastFocusedRef.current?.focus?.();
    };
  }, [open, onClose]);

  // Click on the backdrop (not on the media) closes. Comparing
  // event.target === currentTarget is the simplest way to detect a true
  // backdrop click vs. a bubbled click from a child element.
  const onBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  const isVideo = mediaType === "video";

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onBackdropClick}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        // Dark, semi-transparent backdrop. Black/80 sits comfortably over
        // both light and dark themes and still lets the page bleed through
        // so it doesn't feel like a hard page break.
        "bg-black/80 backdrop-blur-sm",
        // Enter animation — Tailwind keyframes (`animate-in` etc.) are
        // already present in this repo's global stylesheet via the
        // shadcn/tw-animate-css pipeline (see ui/dialog.tsx).
        "animate-in fade-in-0 duration-150",
      )}
    >
      <button
        ref={closeBtnRef}
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className={cn(
          "absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full",
          "bg-white/10 text-white hover:bg-white/20",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
          "transition-colors",
        )}
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      {isVideo ? (
        <video
          src={src}
          autoPlay
          controls
          playsInline
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "max-h-[90vh] max-w-[90vw] select-none object-contain",
            "rounded-md shadow-2xl",
            "animate-in zoom-in-95 duration-150",
          )}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "max-h-[90vh] max-w-[90vw] select-none object-contain",
            "rounded-md shadow-2xl",
            "animate-in zoom-in-95 duration-150",
          )}
          draggable={false}
        />
      )}
    </div>
  );
}