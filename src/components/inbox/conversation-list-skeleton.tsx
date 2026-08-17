"use client";

import { cn } from "@/lib/utils";

interface ConversationListSkeletonProps {
  /** Number of skeleton conversation items to render (default: 5) */
  count?: number;
}

/**
 * Skeleton placeholder for the inbox conversation list. Mirrors the
 * visual structure of `ConversationItem` (avatar + name + last message
 * + timestamp) so the load state reads as "conversations are coming",
 * not as an empty screen. Kept consistent with `MessageSkeleton`'s
 * use of `animate-pulse` + muted fills.
 */
export function ConversationListSkeleton({ count = 5 }: ConversationListSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <div className="flex flex-col animate-pulse">
      {items.map((index) => (
        <div
          key={index}
          className="flex w-full items-start gap-3 px-3 py-3"
        >
          {/* Avatar */}
          <div className="h-10 w-10 shrink-0 rounded-full bg-muted-foreground/20" />

          {/* Name + last message */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="h-3.5 w-[45%] rounded bg-muted-foreground/20" />
              <div className="h-2.5 w-8 shrink-0 rounded bg-muted-foreground/20" />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {/* Last message line - vary width for natural look */}
              <div
                className={cn(
                  "h-3 rounded bg-muted-foreground/20",
                  index % 2 === 0 ? "w-[70%]" : "w-[55%]",
                )}
              />
              <div className="flex shrink-0 items-center gap-1.5">
                <div className="h-4 w-4 rounded-full bg-muted-foreground/20" />
                <div className="h-2 w-2 rounded-full bg-muted-foreground/20" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}