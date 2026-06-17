"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, Music, Loader2, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  NEUTRAL_FIELD_SURFACE_CLASS,
  NEUTRAL_SURFACE_STYLE,
} from "@/lib/ui-surfaces";
import { isFavorite, toggleFavorite, getFavorites, enrichFavoritesWithImages } from "@/lib/favorites";

export interface TrackResult {
  id: string;
  name: string;
  artist: string;
  artist_id: string | null;
  album: string;
  image: string | null;
  preview_url: string | null;
  duration_ms: number;
  popularity: number;
  explicit: boolean;
  release_date: string | null;
}

interface TrackSearchProps {
  label: string;
  accentColor: "purple" | "blue";
  selectedTrack: TrackResult | null;
  onSelect: (track: TrackResult) => void;
  onClear: () => void;
  bpm?: number | null;
  musicalKey?: string | null;
  enableFavoritesFilter?: boolean;
  /** Tighter label/field spacing (Set Planner uses default). */
  compact?: boolean;
  /** Custom empty-input placeholder (main page rotating artist hints). */
  placeholder?: string;
  /** Crossfade placeholder text when the placeholder value changes (main page). */
  animatePlaceholder?: boolean;
  /** Notifies parent when the results dropdown opens or closes. */
  onOpenChange?: (isOpen: boolean) => void;
}

const PLACEHOLDER_FADE_MS = 350;

/** Solid grey surface — inline style avoids mosaic flicker from backdrop-blur. */
const TRACK_FIELD_SURFACE_CLASS = cn("relative overflow-hidden", NEUTRAL_FIELD_SURFACE_CLASS);


const SEARCH_DROPDOWN_CLASS =
  "absolute top-full left-0 right-0 mt-2 z-[200] rounded-xl border border-border bg-[#0f0f14] shadow-2xl";

export function TrackSearch({
  label,
  accentColor,
  selectedTrack,
  onSelect,
  onClear,
  bpm = null,
  musicalKey = null,
  enableFavoritesFilter = false,
  compact = false,
  placeholder = "Search for a track...",
  animatePlaceholder = false,
  onOpenChange,
}: TrackSearchProps) {
  const [query, setQuery] = useState("");
  const [displayPlaceholder, setDisplayPlaceholder] = useState(placeholder);
  const [placeholderFaded, setPlaceholderFaded] = useState(false);
  const [results, setResults] = useState<TrackResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [isRecent, setIsRecent] = useState(false);
  const [isFavorites, setIsFavorites] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [favorited, setFavorited] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!animatePlaceholder) {
      setDisplayPlaceholder(placeholder);
      setPlaceholderFaded(false);
      return;
    }
    if (placeholder === displayPlaceholder) return;

    setPlaceholderFaded(true);
    const swapTimer = window.setTimeout(() => {
      setDisplayPlaceholder(placeholder);
      setPlaceholderFaded(false);
    }, PLACEHOLDER_FADE_MS);

    return () => window.clearTimeout(swapTimer);
  }, [animatePlaceholder, placeholder, displayPlaceholder]);

  const loadRecentTracks = useCallback(async () => {
    setIsFavorites(false);
    setLoading(true);
    try {
      const res = await fetch("/api/spotify/recently-played");
      if (res.status === 401 || !res.ok) {
        setResults([]);
        setOpen(false);
        setIsRecent(false);
        setIsFavorites(false);
        return;
      }
      const data = await res.json();
      const tracks: TrackResult[] = data.tracks ?? [];
      if (tracks.length > 0) {
        setResults(tracks);
        setIsRecent(true);
        setOpen(true);
        setFocusedIndex(-1);
      } else {
        setResults([]);
        setOpen(false);
        setIsRecent(false);
      }
    } catch {
      setResults([]);
      setOpen(false);
      setIsRecent(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) return;
    setIsRecent(false);
    setIsFavorites(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.tracks ?? []);
      setOpen(true);
      setFocusedIndex(-1);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFavorites = useCallback(async () => {
    setIsRecent(false);
    setIsFavorites(true);
    setQuery("");
    setLoading(true);
    try {
      const favorites = await enrichFavoritesWithImages(getFavorites());
      const tracks: TrackResult[] = favorites.map((f) => ({
        id: f.spotify_id,
        name: f.name,
        artist: f.artist,
        artist_id: null,
        album: "",
        image: f.image ?? null,
        preview_url: null,
        duration_ms: 0,
        popularity: 0,
        explicit: false,
        release_date: null,
      }));
      setResults(tracks);
      setOpen(true);
      setFocusedIndex(-1);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggleFavorites = useCallback(() => {
    if (isFavorites) {
      setIsFavorites(false);
      setResults([]);
      setOpen(false);
      return;
    }
    loadFavorites();
  }, [isFavorites, loadFavorites]);

  const handleFocus = useCallback(() => {
    if (isFavorites && results.length > 0) {
      setOpen(true);
      return;
    }
    if (query.trim().length >= 2) {
      if (results.length > 0) setOpen(true);
      return;
    }
    if (query.trim().length === 0) {
      void loadRecentTracks();
    }
  }, [query, results.length, loadRecentTracks, isFavorites]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (query.trim().length < 2) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (selectedTrack) {
      setFavorited(isFavorite(selectedTrack.id));
    } else {
      setFavorited(false);
    }
  }, [selectedTrack]);

  function handleFavoriteClick() {
    if (!selectedTrack) return;
    const { favorited: nowFavorited } = toggleFavorite({
      name: selectedTrack.name,
      artist: selectedTrack.artist,
      spotify_id: selectedTrack.id,
      bpm: bpm ?? null,
      key: musicalKey ?? null,
      image: selectedTrack.image ?? null,
    });
    setFavorited(nowFavorited);
  }

  function handleSelect(track: TrackResult) {
    onSelect(track);
    setQuery("");
    setOpen(false);
    setResults([]);
    setIsRecent(false);
    setIsFavorites(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && focusedIndex >= 0) {
      e.preventDefault();
      handleSelect(results[focusedIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function formatDuration(ms: number) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  const accentStyles = {
    purple: {
      ring: "focus-within:ring-[#a855f7]/40",
      border: "focus-within:border-[#a855f7]/60",
      label: "text-[#a855f7]",
      badge: "bg-[#a855f7]/20 text-[#c084fc] border-[#a855f7]/30",
      hover: "hover:bg-[#a855f7]/10",
    },
    blue: {
      ring: "focus-within:ring-[#3b82f6]/40",
      border: "focus-within:border-[#3b82f6]/60",
      label: "text-[#60a5fa]",
      badge: "bg-[#3b82f6]/20 text-[#93c5fd] border-[#3b82f6]/30",
      hover: "hover:bg-[#3b82f6]/10",
    },
  }[accentColor];

  const fieldSurfaceClass = TRACK_FIELD_SURFACE_CLASS;
  const fieldSurfaceStyle = NEUTRAL_SURFACE_STYLE;

  const fieldHeightClass = "h-14";

  const selectedTrackLayoutClass = cn(
    "flex items-center rounded-xl border border-border min-w-0 w-full",
    fieldHeightClass,
    compact ? "px-2.5 py-2" : "px-3 py-2.5"
  );

  return (
    <div
      className={cn(
        "flex min-w-0 w-full flex-col",
        compact ? "min-h-0 gap-1" : "min-h-[6.5rem] gap-2"
      )}
      ref={containerRef}
    >
      {/* Label */}
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-md px-2 py-0.5",
          "text-xs font-semibold tracking-wide uppercase",
          selectedTrack ? "text-muted-foreground" : accentStyles.label
        )}
      >
        {label}
      </span>

      {selectedTrack ? (
        /* Selected state */
        <div className={cn(fieldSurfaceClass, selectedTrackLayoutClass)} style={fieldSurfaceStyle}>
          <div className="relative z-10 flex min-w-0 w-full items-center gap-3.5">
            {selectedTrack.image ? (
              <img
                src={selectedTrack.image}
                alt={`${selectedTrack.album} album art`}
                className="size-9 flex-shrink-0 rounded-md object-cover ring-1 ring-white/10"
              />
            ) : (
              <div className="flex size-9 flex-shrink-0 items-center justify-center rounded-md bg-muted ring-1 ring-white/10">
                <Music className="size-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1 overflow-hidden py-0.5">
              <p
                className="truncate text-sm font-semibold leading-snug text-foreground"
                title={selectedTrack.name}
              >
                {selectedTrack.name}
              </p>
              <p
                className="truncate text-xs leading-snug text-muted-foreground"
                title={selectedTrack.artist}
              >
                {selectedTrack.artist}
              </p>
              <p
                className="truncate text-xs leading-snug text-muted-foreground/70"
                title={selectedTrack.album || undefined}
              >
                {selectedTrack.album || "\u00A0"}
              </p>
            </div>
            <div className="ml-1 flex flex-shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={handleFavoriteClick}
                aria-label={favorited ? "Remove from favorites" : "Save to favorites"}
                aria-pressed={favorited}
                className={cn(
                  "flex size-7 flex-shrink-0 items-center justify-center rounded-full transition-colors",
                  favorited
                    ? "text-rose-400 hover:bg-white/10 hover:text-rose-300"
                    : "text-muted-foreground hover:bg-white/10 hover:text-rose-400"
                )}
              >
                <Heart className={cn("size-4", favorited && "fill-current")} />
              </button>
              <button
                onClick={onClear}
                aria-label="Remove track"
                className="flex size-7 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Search input + dropdown */
        <div className={cn("relative", open ? "z-[200]" : "z-20", fieldHeightClass)}>
          <div
            className={cn(
              "relative flex h-full items-center rounded-xl border ring-2 ring-transparent transition-[border-color,box-shadow]",
              fieldSurfaceClass,
              accentStyles.ring,
              accentStyles.border,
              "border-border"
            )}
            style={fieldSurfaceStyle}
          >
            {loading ? (
              <Loader2 className="ml-3 size-4 text-muted-foreground animate-spin flex-shrink-0" />
            ) : (
              <Search className="ml-3 size-4 text-muted-foreground flex-shrink-0" />
            )}
            <div className="relative min-w-0 flex-1">
              {animatePlaceholder && !query && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center truncate px-3 text-sm text-zinc-400/90 transition-opacity",
                    placeholderFaded ? "opacity-0" : "opacity-100"
                  )}
                  style={{ transitionDuration: `${PLACEHOLDER_FADE_MS}ms` }}
                >
                  {displayPlaceholder}
                </span>
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (isFavorites) setIsFavorites(false);
                }}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                placeholder={animatePlaceholder ? "" : placeholder}
                className={cn(
                  "w-full bg-transparent px-3 py-2 text-sm text-foreground outline-none min-w-0",
                  animatePlaceholder
                    ? "placeholder:text-zinc-400/90"
                    : "placeholder:text-muted-foreground/70",
                  enableFavoritesFilter ? "pr-1" : query ? "pr-1" : ""
                )}
                aria-label={`Search for ${label}`}
                aria-autocomplete="list"
                aria-expanded={open}
              />
            </div>
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                  setIsRecent(false);
                  setIsFavorites(false);
                }}
                className="mr-1 size-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
            {enableFavoritesFilter && (
              <button
                type="button"
                onClick={handleToggleFavorites}
                aria-label={isFavorites ? "Exit favorites filter" : "Show favorites"}
                aria-pressed={isFavorites}
                className={cn(
                  "mr-2 size-6 rounded-full flex items-center justify-center transition-colors flex-shrink-0",
                  isFavorites
                    ? "text-rose-400 hover:text-rose-300"
                    : "text-muted-foreground hover:text-rose-400"
                )}
              >
                <Heart className={cn("size-3.5", isFavorites && "fill-current")} />
              </button>
            )}
          </div>

          {/* Dropdown */}
          {open && results.length > 0 && (
            <div
              className={cn(SEARCH_DROPDOWN_CLASS, "overflow-hidden")}
              role="listbox"
              aria-label={
                isFavorites
                  ? "Favorites"
                  : isRecent
                  ? "Recently played tracks"
                  : "Search results"
              }
            >
              {isFavorites && (
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-rose-400/80 border-b border-border/50">
                  Favorites
                </div>
              )}
              {isRecent && !isFavorites && (
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground border-b border-border/50">
                  Recently Played
                </div>
              )}
              <div className="max-h-72 overflow-y-auto">
                {results.map((track, idx) => (
                  <button
                    key={track.id}
                    role="option"
                    aria-selected={idx === focusedIndex}
                    onClick={() => handleSelect(track)}
                    className={cn(
                      "w-full min-w-0 flex items-center gap-3 px-3 py-2.5 text-left transition-colors overflow-hidden",
                      idx === focusedIndex ? "bg-[#a855f7]/15" : accentStyles.hover,
                      idx < results.length - 1 && "border-b border-border/50"
                    )}
                  >
                    {track.image ? (
                      <img
                        src={track.image}
                        alt=""
                        aria-hidden="true"
                        className="size-10 rounded-md object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="size-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                        <Music className="size-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p
                        className="text-sm font-medium truncate text-foreground"
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
                    </div>
                    <span className="text-xs text-muted-foreground/50 flex-shrink-0">
                      {formatDuration(track.duration_ms)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {open && isFavorites && results.length === 0 && (
            <div className={cn(SEARCH_DROPDOWN_CLASS, "p-6 text-center")}>
              <p className="text-sm text-muted-foreground">No favorites yet — heart a track to save it here.</p>
            </div>
          )}

          {open && query.length >= 2 && results.length === 0 && !loading && !isFavorites && (
            <div className={cn(SEARCH_DROPDOWN_CLASS, "p-6 text-center")}>
              <p className="text-sm text-muted-foreground">No tracks found for &ldquo;{query}&rdquo;</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
