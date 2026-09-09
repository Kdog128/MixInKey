"use client";

import { useEffect, useMemo, useState } from "react";
import { Dices, ListPlus, Loader2, Music, Sparkles } from "lucide-react";
import {
  getKeyCompatStyle,
  getTransitionAnalysis,
  parseMusicalKeyString,
  type KeyCompatibility,
  type TransitionAnalysis,
} from "@/lib/camelot";
import type { SetlistTrack } from "@/lib/setlist";
import { COHESIVE_INNER_CARD_CLASS, cohesiveSurfaceStyle } from "@/lib/ui-surfaces";
import { cn } from "@/lib/utils";

export interface RecommendedNextTrack {
  spotify_id: string;
  name: string;
  artist: string;
  image: string | null;
  bpm: number | null;
  camelot: string;
  compatibility: KeyCompatibility;
}

interface NextTrackResponse {
  tracks?: RecommendedNextTrack[];
}

const RECOMMENDED_ROW_GRID_CLASS =
  "sm:grid sm:grid-cols-[3rem_minmax(0,1fr)_2.5rem_2.75rem_7.5rem_auto] sm:items-center sm:gap-x-2";

function lastTrackCamelot(track: SetlistTrack): string | null {
  if (track.camelot_label?.trim()) return track.camelot_label.trim();
  const parsed = track.musical_key ? parseMusicalKeyString(track.musical_key) : null;
  return parsed?.label ?? null;
}

function MixBadge({ transition }: { transition: TransitionAnalysis }) {
  const style = getKeyCompatStyle(transition.keyCompat.type);

  return (
    <span className="relative group inline-flex">
      <span
        className="inline-flex items-center justify-center max-w-[7.5rem] px-2.5 py-1 rounded-full border text-[11px] font-semibold truncate cursor-default"
        style={{
          color: style.color,
          backgroundColor: style.bg,
          borderColor: style.border,
        }}
      >
        {transition.energyLabel}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 z-50 w-max max-w-[15rem] px-2.5 py-1.5 rounded-md border border-border bg-popover text-popover-foreground text-[11px] leading-snug text-center shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-150"
      >
        {transition.tooltip}
        <span
          aria-hidden
          className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-popover"
        />
      </span>
    </span>
  );
}

function CamelotBadge({
  label,
  transition,
}: {
  label: string;
  transition?: TransitionAnalysis | null;
}) {
  const style = transition ? getKeyCompatStyle(transition.keyCompat.type) : null;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-full border text-[11px] font-bold font-mono",
        !style && "border-border bg-white/5 text-foreground"
      )}
      style={
        style
          ? {
              color: style.color,
              backgroundColor: style.bg,
              borderColor: style.border,
            }
          : undefined
      }
      title={transition?.keyCompat.description}
    >
      {label}
    </span>
  );
}

interface SetlistRecommendedNextProps {
  lastTrack: SetlistTrack;
  excludeIds: string[];
  onAdd: (track: RecommendedNextTrack) => void;
  adding?: boolean;
}

export function SetlistRecommendedNext({
  lastTrack,
  excludeIds,
  onAdd,
  adding = false,
}: SetlistRecommendedNextProps) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<RecommendedNextTrack[]>([]);
  const [index, setIndex] = useState(0);

  const camelot = lastTrackCamelot(lastTrack);
  const bpm = lastTrack.bpm;
  const canRecommend = Boolean(lastTrack.spotify_id && camelot && bpm != null);
  const excludeKey = useMemo(
    () => [...excludeIds].sort().join(","),
    [excludeIds]
  );

  useEffect(() => {
    if (!canRecommend || !camelot || bpm == null) {
      setCandidates([]);
      setIndex(0);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadRecommendation() {
      setLoading(true);
      setIndex(0);
      try {
        const res = await fetch("/api/recommendations/next-track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pool: "tracks_cache",
            exclude_spotify_ids: excludeKey ? excludeKey.split(",") : [],
            track2: {
              spotify_id: lastTrack.spotify_id,
              camelot,
              bpm,
              name: lastTrack.name,
              artist: lastTrack.artist,
            },
          }),
        });
        if (!res.ok) throw new Error("Next track request failed");
        const data = (await res.json()) as NextTrackResponse;
        if (cancelled) return;
        setCandidates(Array.isArray(data.tracks) ? data.tracks : []);
      } catch {
        if (!cancelled) setCandidates([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRecommendation();
    return () => {
      cancelled = true;
    };
  }, [
    lastTrack.spotify_id,
    lastTrack.name,
    lastTrack.artist,
    camelot,
    bpm,
    excludeKey,
    canRecommend,
  ]);

  const suggestion = candidates[index] ?? null;
  const transition = suggestion
    ? getTransitionAnalysis(lastTrack, {
        bpm: suggestion.bpm,
        camelot_label: suggestion.camelot,
      })
    : null;

  function handleReshuffle() {
    if (candidates.length < 2) return;
    setIndex((current) => (current + 1) % candidates.length);
  }

  return (
    <div
      className={cn(COHESIVE_INNER_CARD_CLASS, "mt-4 px-4 py-3 flex flex-col gap-3")}
      style={cohesiveSurfaceStyle()}
    >
      <div className="flex items-start gap-2.5">
        <Sparkles className="size-5 text-[#a855f7] flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-foreground">
              Recommended Next
            </h3>
            <span className="group/next-reroll relative ml-auto inline-flex">
              <button
                type="button"
                onClick={handleReshuffle}
                disabled={loading || adding || candidates.length < 2}
                aria-label="Get a different suggestion"
                className="inline-flex rounded-md p-1.5 text-muted-foreground transition-[color,filter] hover:text-white hover:drop-shadow-[0_0_8px_rgba(168,85,247,0.85)] disabled:pointer-events-none disabled:opacity-40 disabled:grayscale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a855f7]/50"
              >
                <Dices className="size-5" aria-hidden="true" />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute top-[calc(100%+6px)] right-0 z-50 w-max rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] text-popover-foreground shadow-lg opacity-0 invisible transition-opacity duration-150 group-hover/next-reroll:visible group-hover/next-reroll:opacity-100"
              >
                Get a different suggestion
              </span>
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-snug">
            Best mix after {lastTrack.name}
          </p>
        </div>
      </div>

      {!canRecommend ? (
        <p className="text-xs text-muted-foreground/70 text-center py-4">
          The last track needs BPM and key before we can recommend what follows.
        </p>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-[#a855f7]" />
          Finding next tracks…
        </div>
      ) : !suggestion ? (
        <p className="text-xs text-muted-foreground/70 text-center py-4">
          No suggestions found in the cache
        </p>
      ) : (
        <div
          className={cn(
            COHESIVE_INNER_CARD_CLASS,
            "px-3 py-4 min-w-0 flex items-center gap-2 sm:gap-0",
            RECOMMENDED_ROW_GRID_CLASS
          )}
          style={cohesiveSurfaceStyle()}
        >
          {suggestion.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={suggestion.image}
              alt=""
              className="size-12 rounded-md object-cover flex-shrink-0 ring-1 ring-white/10"
            />
          ) : (
            <div className="size-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0 ring-1 ring-white/10">
              <Music className="size-5 text-muted-foreground" />
            </div>
          )}

          <div className="min-w-0 overflow-hidden flex-1 sm:flex-none">
            <p className="text-base font-semibold truncate text-foreground" title={suggestion.name}>
              {suggestion.name}
            </p>
            <p className="text-sm text-muted-foreground truncate" title={suggestion.artist}>
              {suggestion.artist}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1 sm:hidden">
              <span className="text-xs font-mono text-muted-foreground">
                {suggestion.bpm != null ? `${suggestion.bpm} BPM` : "— BPM"}
              </span>
              {suggestion.camelot ? (
                <CamelotBadge label={suggestion.camelot} transition={transition} />
              ) : null}
              {transition ? <MixBadge transition={transition} /> : null}
            </div>
          </div>

          <span className="hidden sm:block text-right text-sm font-mono text-muted-foreground tabular-nums">
            {suggestion.bpm != null ? suggestion.bpm : "—"}
          </span>

          <div className="hidden sm:flex justify-center">
            {suggestion.camelot ? (
              <CamelotBadge label={suggestion.camelot} transition={transition} />
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>

          <div className="hidden sm:flex justify-end min-w-0">
            {transition ? <MixBadge transition={transition} /> : null}
          </div>

          <button
            type="button"
            onClick={() => onAdd(suggestion)}
            disabled={adding}
            className="ml-auto sm:ml-0 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#a855f7]/30 bg-[#a855f7]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#c084fc] transition-[colors,box-shadow,border-color] hover:border-[#a855f7]/50 hover:bg-[#a855f7]/20 hover:shadow-[0_0_16px_rgba(168,85,247,0.4)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {adding ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ListPlus className="size-3.5" />
            )}
            Add to Set
          </button>
        </div>
      )}
    </div>
  );
}
