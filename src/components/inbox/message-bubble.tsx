"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { cn } from "@/lib/utils";
import type { Message, MessageReaction } from "@/types";
import {
  Clock,
  Check,
  CheckCheck,
  XCircle,
  FileText,
  MapPin,
  LayoutTemplate,
  ImageOff,
  CornerDownLeft,
  Sparkles,
  Play,
  Pause,
  Video,
} from "lucide-react";
import { format } from "date-fns";
import { ReplyQuote } from "./reply-quote";
import { MessageReactions } from "./message-reactions";
import { InteractivePreview } from "@/components/interactive/interactive-preview";
import { Lightbox } from "./lightbox";
import { useTranslations } from "next-intl";

interface MessageBubbleProps {
  message: Message;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
}

function StatusIcon({ status }: { status: Message["status"] }) {
  switch (status) {
    case "sending":
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    case "sent":
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case "read":
      return <CheckCheck className="h-3 w-3 text-blue-400" />;
    case "failed":
      return <XCircle className="h-3 w-3 text-red-400" />;
    default:
      return null;
  }
}

function MediaUnavailable({ label, t }: { label: string, t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <ImageOff className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>{t("unavailable", { label })}</span>
    </div>
  );
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Compact capsule-style audio player for chat bubbles.
 *
 * Tone adapts to the bubble's surface: `isAgent` (outbound / primary fill)
 * uses primary-foreground tints, `!isAgent` (inbound / muted fill) uses
 * foreground tints. Keeps the native <audio> element off-screen so we can
 * style the controls ourselves while still benefiting from the browser's
 * streaming + decode pipeline. All listeners are attached in a single
 * useEffect and torn down (with a pause) on unmount / src change.
 */
function AudioPlayer({
  src,
  isAgent,
  t,
}: {
  src: string;
  isAgent: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Refs let the listeners read the latest values without re-binding them
  // every render — keeps the effect dependency on `src` only.
  const isScrubbingRef = useRef(false);

  // State resets are handled by the parent re-mounting this component via
  // `key={src}` (see MessageContent). Inside this effect we only touch the
  // external system (the <audio> element) and subscribe to its events.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onTimeUpdate = () => {
      if (!isScrubbingRef.current) setCurrentTime(audio.currentTime);
    };
    const onDurationChange = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };
    const onSeeked = () => {
      setCurrentTime(audio.currentTime);
      isScrubbingRef.current = false;
    };
    const onSeeking = () => {
      isScrubbingRef.current = true;
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("seeked", onSeeked);
    audio.addEventListener("seeking", onSeeking);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("seeked", onSeeked);
      audio.removeEventListener("seeking", onSeeking);
      // Pause so we don't leak playback when the bubble scrolls off.
      audio.pause();
    };
  }, [src]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => {
        // Autoplay can be blocked; reflect the failure by reverting state.
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, []);

  const handleSeek = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration || duration === Infinity) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.min(
        1,
        Math.max(0, (event.clientX - rect.left) / rect.width),
      );
      const next = ratio * duration;
      isScrubbingRef.current = true;
      setCurrentTime(next);
      audio.currentTime = next;
    },
    [duration],
  );

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  // Tone tokens — kept in one place so we can tune both surfaces together.
  const playButtonClass = isAgent
    ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90"
    : "bg-foreground text-background hover:bg-foreground/90";
  const trackBgClass = isAgent
    ? "bg-primary-foreground/25"
    : "bg-foreground/15";
  const fillBgClass = isAgent
    ? "bg-primary-foreground"
    : "bg-foreground/85";
  const thumbBorderClass = isAgent
    ? "border-primary"
    : "border-background";
  const timeTextClass = isAgent
    ? "text-primary-foreground/80"
    : "text-muted-foreground";

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3",
        // Wide enough for play + progress + time, narrow enough to feel like a
        // chat attachment (WhatsApp/Telegram style), capped so it can't push
        // the bubble past the row width.
        "w-[240px] max-w-full",
        // Subtle surface tint that adapts to the bubble background.
        isAgent
          ? "bg-primary-foreground/10"
          : "bg-background/60",
      )}
    >
      {/* Native element is hidden — we drive it through the UI below.
          preload="metadata" so we can show duration before play. */}
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? t("pauseAudio") : t("playAudio")}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          isAgent
            ? "focus-visible:ring-primary-foreground/70 focus-visible:ring-offset-primary"
            : "focus-visible:ring-foreground/40 focus-visible:ring-offset-background",
          playButtonClass,
        )}
      >
        {isPlaying ? (
          <Pause className="h-3.5 w-3.5" fill="currentColor" />
        ) : (
          <Play className="h-3.5 w-3.5 translate-x-px" fill="currentColor" />
        )}
      </button>

      <div
        role="slider"
        tabIndex={0}
        aria-label={t("audioSeek", { time: formatAudioTime(currentTime) })}
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration)}
        aria-valuenow={Math.floor(currentTime)}
        onClick={handleSeek}
        className={cn(
          "group relative h-1.5 flex-1 cursor-pointer rounded-full",
          trackBgClass,
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-100",
            fillBgClass,
          )}
          style={{ width: `${progress * 100}%` }}
        />
        <div
          className={cn(
            "pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 opacity-0 transition-opacity duration-150",
            "group-hover:opacity-100",
            fillBgClass,
            thumbBorderClass,
          )}
          style={{ left: `${progress * 100}%` }}
        />
      </div>

      <span
        className={cn(
          "shrink-0 font-mono text-[10px] tabular-nums",
          timeTextClass,
        )}
      >
        {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
      </span>
    </div>
  );
}

function MediaImage({
  url,
  alt,
  t,
}: {
  url: string;
  alt: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const loadImage = useCallback(async () => {
    if (!url) return;

    // Proxy URLs need auth fetch to create blob URL
    if (url.startsWith("/api/whatsapp/media/")) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load media");
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        setSrc(blobUrl);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    } else {
      setSrc(url);
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    loadImage();
    return () => {
      if (src?.startsWith("blob:")) {
        URL.revokeObjectURL(src);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadImage]);

  if (error) {
    return (
      <div className="flex h-40 w-60 items-center justify-center rounded-lg bg-muted">
        <ImageOff className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-40 w-60 items-center justify-center rounded-lg bg-muted">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        aria-label={t("expandImage")}
        title={t("expandImage")}
        className="block cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src ?? ""}
          alt={alt}
          className="max-h-64 max-w-60 rounded-lg object-cover"
          onError={() => setError(true)}
          draggable={false}
        />
      </button>
      <Lightbox
        src={src ?? ""}
        alt={alt}
        mediaType="image"
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        closeLabel={t("closeLightbox")}
      />
    </>
  );
}

function MediaVideo({
  url,
  alt,
  t,
}: {
  url: string;
  alt: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const loadVideo = useCallback(async () => {
    if (!url) return;

    // Proxy URLs need auth fetch to create blob URL
    if (url.startsWith("/api/whatsapp/media/")) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load media");
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        setSrc(blobUrl);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    } else {
      setSrc(url);
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    loadVideo();
    return () => {
      if (src?.startsWith("blob:")) {
        URL.revokeObjectURL(src);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadVideo]);

  if (error) {
    return (
      <div className="flex h-40 w-60 items-center justify-center rounded-lg bg-muted">
        <ImageOff className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-40 w-60 items-center justify-center rounded-lg bg-muted">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Instagram-style video thumbnail
  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        aria-label={t("expandVideo")}
        title={t("expandVideo")}
        className="relative block cursor-pointer rounded-lg overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {/* Video thumbnail preview - using video element without controls for preview */}
        {src ? (
          <video
            src={src}
            muted
            loop
            playsInline
            preload="metadata"
            className="aspect-video w-full object-cover"
            onError={() => setError(true)}
          />
        ) : (
          <div className="aspect-video w-full bg-muted flex items-center justify-center">
            <ImageOff className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        
        {/* Dark overlay with play icon */}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <Play className="h-12 w-12 text-white/90 drop-shadow-lg" fill="currentColor" />
        </div>
        
        {/* Video indicator badge in corner */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-white/90 text-[10px] font-medium">
          <Video className="h-3 w-3" />
          <span>{t("video")}</span>
        </div>
      </button>
      <Lightbox
        src={src ?? ""}
        alt={alt}
        mediaType="video"
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        closeLabel={t("closeLightbox")}
      />
    </>
  );
}

/**
 * Matches http(s):// and bare www. URLs while leaving trailing punctuation
 * (e.g. "visit example.com." → "example.com") alone. We don't try to be
 * fully RFC-3986 compliant — the goal is just to catch the URLs an agent
 * or customer is realistically going to paste into a WhatsApp message.
 */
const URL_REGEX = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/gi;

function linkifyText(text: string): React.ReactNode[] {
  if (!text) return [];
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_REGEX)) {
    const url = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }
    const href = url.startsWith("www.") ? `https://${url}` : url;
    parts.push(
      <a
        key={`${start}-${url}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 underline-offset-2 hover:underline break-all"
      >
        {url}
      </a>,
    );
    lastIndex = start + url.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function MessageContent({ message, isAgent, t }: { message: Message; isAgent: boolean; t: ReturnType<typeof useTranslations> }) {
  switch (message.content_type) {
    case "text":
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {linkifyText(message.content_text ?? "")}
        </p>
      );

    case "image":
      return (
        <div>
          {message.media_url ? (
            <MediaImage url={message.media_url} alt="Shared image" t={t} />
          ) : (
            <MediaUnavailable label={t("photo")} t={t} />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "video":
      return (
        <div>
          {message.media_url ? (
            <MediaVideo url={message.media_url} alt="Shared video" t={t} />
          ) : (
            <MediaUnavailable label={t("video")} t={t} />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "audio":
      return (
        <div>
          {message.media_url ? (
            // key forces a fresh mount per audio src so playback state,
            // listeners and progress reset between bubbles.
            <AudioPlayer
              key={message.media_url}
              src={message.media_url}
              isAgent={isAgent}
              t={t}
            />
          ) : (
            <MediaUnavailable label={t("audio")} t={t} />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "document":
      if (!message.media_url) {
        return <MediaUnavailable label={message.content_text || t("document")} t={t} />;
      }
      return (
        <a
          href={message.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm hover:bg-muted"
        >
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {message.content_text || t("document")}
          </span>
        </a>
      );

    case "template":
      return (
        <div>
          <span className="mb-1 inline-flex items-center gap-1 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            <LayoutTemplate className="h-3 w-3" />
            {t("template")}
          </span>
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "location":
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{message.content_text || t("locationShared")}</span>
        </div>
      );

    case "interactive": {
      // Three cases share content_type='interactive':
      //  - OUTBOUND with payload (composer / automation / Flow send after
      //    migration 035): render the buttons/list as they appear on the phone.
      //  - INBOUND tap (customer chose an option, sender_type='customer'):
      //    no payload; show the tapped option's title with a reply affordance
      //    so agents can tell it's a tap, not the customer typing.
      //  - OUTBOUND with NO payload (legacy bot/Flow sends from before
      //    migration 035 backfilled the column): show the body text plainly —
      //    it is our own message, NOT a customer tap.
      if (message.interactive_payload) {
        return <InteractivePreview payload={message.interactive_payload} />;
      }
      if (message.sender_type === "customer") {
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <CornerDownLeft className="h-3 w-3" />
              {t("buttonReply")}
            </span>
            <p className="whitespace-pre-wrap break-words text-sm">
              {message.content_text || t("interactiveReply")}
            </p>
          </div>
        );
      }
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text || t("interactiveReply")}
        </p>
      );
    }

    default:
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text || t("unsupported")}
        </p>
      );
  }
}

export function MessageBubble({
  message,
  reply,
  reactions,
  currentUserId,
  onToggleReaction,
}: MessageBubbleProps) {
  const t = useTranslations("Inbox.bubble");

  const isAgent = message.sender_type === "agent" || message.sender_type === "bot";
  const time = format(new Date(message.created_at), "HH:mm");

  // Row alignment + width cap are owned by <MessageActions> so its hover
  // group matches the bubble's content area, not the full row.
  return (
    <div
      className={cn(
        "flex flex-col",
        isAgent ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "relative rounded-2xl px-3 py-2",
          isAgent
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        {reply && (
          <ReplyQuote
            authorLabel={reply.authorLabel}
            preview={reply.preview}
            onPrimary={isAgent}
          />
        )}
        <MessageContent message={message} isAgent={isAgent} t={t} />
        <div
          className={cn(
            "mt-1 flex items-center gap-1",
            isAgent ? "justify-end" : "justify-start",
          )}
        >
          {/* AI badge — only on replies the auto-reply bot generated
              (always outbound, so it sits on the primary fill). Lets
              agents tell an AI reply from their own / a Flow's at a
              glance. */}
          {message.ai_generated && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-primary-foreground/20 px-1.5 py-px text-[9px] font-semibold uppercase leading-none tracking-wide text-primary-foreground"
              title={t("aiBadgeTitle")}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {t("aiBadge")}
            </span>
          )}
          <span
            className={cn(
              "text-[10px]",
              // Outbound bubbles sit on the primary fill, so the
              // timestamp must read against that (not the neutral
              // foreground) — otherwise it goes low-contrast in light
              // mode. Inbound bubbles use the muted surface.
              isAgent ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {time}
          </span>
          {isAgent && <StatusIcon status={message.status} />}
        </div>
      </div>
      {reactions && reactions.length > 0 && onToggleReaction && (
        <MessageReactions
          reactions={reactions}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
        />
      )}
    </div>
  );
}
