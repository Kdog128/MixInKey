"use client";

import { useEffect, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { GripVertical, Trash2, Heart, Music } from "lucide-react";
import type { SetlistTrack } from "@/lib/setlist";
import {
  getKeyCompatStyle,
  getTransitionAnalysis,
  parseMusicalKeyString,
  type TransitionAnalysis,
} from "@/lib/camelot";
import { isFavorite, toggleFavorite } from "@/lib/favorites";
import { cn } from "@/lib/utils";

interface SetlistTrackListProps {
  tracks: SetlistTrack[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (spotifyId: string) => void;
}

function displayCamelotLabel(track: SetlistTrack): string | null {
  if (track.camelot_label) return track.camelot_label;
  const parsed = track.musical_key ? parseMusicalKeyString(track.musical_key) : null;
  return parsed?.label ?? null;
}

function CamelotLabelBadge({
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
        "inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-full border text-[10px] font-bold font-mono",
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

function TransitionBadge({ transition }: { transition: TransitionAnalysis }) {
  const style = getKeyCompatStyle(transition.keyCompat.type);

  return (
    <span className="relative group inline-flex">
      <span
        className="inline-flex items-center justify-center max-w-[5.5rem] sm:max-w-[7.5rem] px-2 py-0.5 rounded-full border text-[10px] font-semibold truncate cursor-default"
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

export function SetlistTrackList({ tracks, onReorder, onRemove }: SetlistTrackListProps) {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setFavoriteIds(
      new Set(tracks.filter((t) => isFavorite(t.spotify_id)).map((t) => t.spotify_id))
    );
  }, [tracks]);

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    onReorder(result.source.index, result.destination.index);
  }

  function handleFavoriteToggle(track: SetlistTrack) {
    const { favorited } = toggleFavorite({
      name: track.name,
      artist: track.artist,
      spotify_id: track.spotify_id,
      bpm: track.bpm,
      key: track.musical_key,
    });
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (favorited) next.add(track.spotify_id);
      else next.delete(track.spotify_id);
      return next;
    });
  }

  if (tracks.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-raised px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">No tracks yet — search above to build your set.</p>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="setlist">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex flex-col gap-2"
          >
            {tracks.map((track, index) => {
              const nextTrack = tracks[index + 1];
              const outgoingTransition = nextTrack
                ? getTransitionAnalysis(track, nextTrack)
                : null;
              const camelotLabel = displayCamelotLabel(track);

              return (
                <Draggable key={track.spotify_id} draggableId={track.spotify_id} index={index}>
                  {(dragProvided, snapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className={cn(
                        "flex items-center gap-2 sm:gap-3 rounded-xl border border-border bg-surface-raised px-2 sm:px-3 py-3 min-w-0",
                        snapshot.isDragging && "shadow-lg ring-1 ring-white/10"
                      )}
                    >
                      <button
                        type="button"
                        {...dragProvided.dragHandleProps}
                        aria-label={`Reorder ${track.name}`}
                        className="flex-shrink-0 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
                      >
                        <GripVertical className="size-4" />
                      </button>

                      {track.image ? (
                        <img
                          src={track.image}
                          alt=""
                          className="size-10 rounded-md object-cover flex-shrink-0 ring-1 ring-white/10"
                        />
                      ) : (
                        <div className="size-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0 ring-1 ring-white/10">
                          <Music className="size-4 text-muted-foreground" />
                        </div>
                      )}

                      <span className="flex-shrink-0 w-5 sm:w-6 text-xs font-mono text-muted-foreground text-center">
                        {track.position}
                      </span>

                      <div className="flex-1 min-w-0 overflow-hidden">
                        <p
                          className="text-sm font-semibold truncate text-foreground"
                          title={track.name}
                        >
                          {track.name}
                        </p>
                        <p
                          className="text-xs text-muted-foreground truncate"
                          title={track.artist}
                        >
                          {track.artist}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 sm:hidden">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {track.bpm != null ? `${track.bpm} BPM` : "— BPM"}
                          </span>
                          {camelotLabel && (
                            <CamelotLabelBadge label={camelotLabel} transition={outgoingTransition} />
                          )}
                        </div>
                      </div>

                      <div className="hidden sm:flex flex-shrink-0 items-center gap-3">
                        <span className="w-10 text-right text-xs font-mono text-muted-foreground">
                          {track.bpm != null ? track.bpm : "—"}
                        </span>
                        {camelotLabel ? (
                          <CamelotLabelBadge label={camelotLabel} transition={outgoingTransition} />
                        ) : (
                          <span className="w-10 text-center text-xs text-muted-foreground">—</span>
                        )}
                      </div>

                      {outgoingTransition && (
                        <div className="flex-shrink-0">
                          <TransitionBadge transition={outgoingTransition} />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleFavoriteToggle(track)}
                        aria-label={
                          favoriteIds.has(track.spotify_id)
                            ? "Remove from favorites"
                            : "Save to favorites"
                        }
                        aria-pressed={favoriteIds.has(track.spotify_id)}
                        className={cn(
                          "flex-shrink-0 size-8 rounded-full flex items-center justify-center transition-colors",
                          favoriteIds.has(track.spotify_id)
                            ? "text-rose-400 hover:text-rose-300 hover:bg-rose-400/10"
                            : "text-muted-foreground hover:text-rose-400 hover:bg-rose-400/10"
                        )}
                      >
                        <Heart
                          className={cn(
                            "size-4",
                            favoriteIds.has(track.spotify_id) && "fill-current"
                          )}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemove(track.spotify_id)}
                        aria-label={`Remove ${track.name}`}
                        className="flex-shrink-0 size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
