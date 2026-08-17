"use client";

import { cn } from "@/lib/utils";

interface MessageSkeletonProps {
  /** Number of skeleton bubble pairs to render (default: 3) */
  count?: number;
}

export function MessageSkeleton({ count = 3 }: MessageSkeletonProps) {
  const bubbles = Array.from({ length: count }, (_, i) => i);

  return (
    <div className="space-y-4 animate-pulse">
      {bubbles.map((_, index) => (
        <div key={index} className="space-y-2">
          {/* Customer message (inbound) - aligned left, wider */}
          <div className="flex items-start">
            <div className={cn(
              "relative rounded-2xl px-3 py-2 rounded-bl-md bg-muted text-foreground",
              // Vary width for natural look
              index % 2 === 0 ? "w-[65%]" : "w-[75%]",
            )}>
              <div className="space-y-1.5">
                {/* Simulated text lines - wider bubble gets more lines */}
                <div className="h-3 w-[70%] bg-muted-foreground/20 rounded" />
                <div className="h-3 w-[85%] bg-muted-foreground/20 rounded" />
                {index % 2 === 0 ? (
                  <> {/* 65% width - 3 lines */}
                    <div className="h-3 w-[55%] bg-muted-foreground/20 rounded" />
                  </>
                ) : (
                  <> {/* 75% width - 4 lines */}
                    <div className="h-3 w-[65%] bg-muted-foreground/20 rounded" />
                    <div className="h-3 w-[45%] bg-muted-foreground/20 rounded" />
                  </>
                )}
              </div>
              <div className="mt-2 flex items-center gap-1 justify-start">
                <div className="h-2.5 w-10 bg-muted/50 rounded-full" />
              </div>
            </div>
          </div>

          {/* Agent message (outbound) - aligned right, narrower */}
          <div className="flex items-end justify-end">
            <div className={cn(
              "relative rounded-2xl px-3 py-2 rounded-br-md bg-primary text-primary-foreground",
              // Vary width for natural look
              index % 2 === 0 ? "w-[50%]" : "w-[55%]",
            )}>
              <div className="space-y-1.5">
                {/* Simulated text lines - narrower bubble gets fewer lines */}
                <div className="h-3 w-[60%] bg-primary-foreground/20 rounded" />
                {index % 2 === 0 ? (
                  <> {/* 50% width - 2 lines */}
                    <div className="h-3 w-[45%] bg-primary-foreground/20 rounded" />
                  </>
                ) : (
                  <> {/* 55% width - 3 lines */}
                    <div className="h-3 w-[55%] bg-primary-foreground/20 rounded" />
                    <div className="h-3 w-[40%] bg-primary-foreground/20 rounded" />
                  </>
                )}
              </div>
              <div className="mt-2 flex items-center gap-1 justify-end">
                <div className="h-2.5 w-10 bg-primary/30 rounded-full" />
                <div className="h-2.5 w-5 bg-primary/30 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}