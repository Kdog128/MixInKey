"use client";

import type { ReactNode } from "react";
import { Music } from "lucide-react";
import { CamelotBadge, MixBadge } from "@/components/mix-badges";
import type { TransitionAnalysis } from "@/lib/camelot";
import { COHESIVE_INNER_CARD_CLASS, cohesiveSurfaceStyle } from "@/lib/ui-surfaces";
import { cn } from "@/lib/utils";

export interface CompatibleTrackDisplay {
  spotify_id: string;
  name: string;
  artist: string;
  image: string | null;
  bpm: number | null;
  camelot: string;
}

export const COMPATIBLE_TRACK_ROW_GRID_CLASS =
  "sm:grid sm:grid-cols-[3rem_minmax(0,1fr)_2.5rem_2.75rem_7.5rem_auto] sm:items-center sm:gap-x-2";

export function CompatibleTrackRow({
  track,
  transition,
  actions,
  className,
}: {
  track: CompatibleTrackDisplay;
  transition: TransitionAnalysis | null;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        COHESIVE_INNER_CARD_CLASS,
        "px-3 py-4 min-w-0 flex items-center gap-2 sm:gap-0",
        COMPATIBLE_TRACK_ROW_GRID_CLASS,
        className
      )}
      style={cohesiveSurfaceStyle()}
    >
      {track.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={track.image}
          alt=""
          className="size-12 rounded-md object-cover flex-shrink-0 ring-1 ring-white/10"
        />
      ) : (
        <div className="size-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0 ring-1 ring-white/10">
          <Music className="size-5 text-muted-foreground" />
        </div>
      )}

      <div className="min-w-0 overflow-hidden flex-1 sm:flex-none">
        <p className="text-base font-semibold truncate text-foreground" title={track.name}>
          {track.name}
        </p>
        <p className="text-sm text-muted-foreground truncate" title={track.artist}>
          {track.artist}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1 sm:hidden">
          <span className="text-xs font-mono text-muted-foreground">
            {track.bpm != null ? `${track.bpm} BPM` : "— BPM"}
          </span>
          {track.camelot ? <CamelotBadge label={track.camelot} transition={transition} /> : null}
          {transition ? <MixBadge transition={transition} /> : null}
        </div>
      </div>

      <span className="hidden sm:block text-right text-sm font-mono text-muted-foreground tabular-nums">
        {track.bpm != null ? track.bpm : "—"}
      </span>

      <div className="hidden sm:flex justify-center">
        {track.camelot ? (
          <CamelotBadge label={track.camelot} transition={transition} />
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>

      <div className="hidden sm:flex justify-end min-w-0">
        {transition ? <MixBadge transition={transition} /> : null}
      </div>

      {actions ? (
        <div className="ml-auto sm:ml-0 flex items-center justify-end gap-1.5 flex-shrink-0">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
