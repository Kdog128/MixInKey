"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, Music, Loader2, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { isFavorite, toggleFavorite } from "@/lib/favorites";

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
}

export function TrackSearch({
  label,
  accentColor,
  selectedTrack,
  onSelect,
  onClear,
  bpm = null,
  musicalKey = null,
}: TrackSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TrackResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [isRecent, setIsRecent] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [favorited, setFavorited] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadRecentTracks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/spotify/recently-played");
      if (res.status === 401 || !res.ok) {
        setResults([]);
        setOpen(false);
        setIsRecent(false);
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

  const handleFocus = useCallback(() => {
    if (query.trim().length >= 2) {
      if (results.length > 0) setOpen(true);
      return;
    }
    if (query.trim().length === 0) {
      void loadRecentTracks();
    }
  }, [query, results.length, loadRecentTracks]);

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
    });
    setFavorited(nowFavorited);
  }

  function handleSelect(track: TrackResult) {
    onSelect(track);
    setQuery("");
    setOpen(false);
    setResults([]);
    setIsRecent(false);
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

  return (
    <div className="flex flex-col gap-2 min-w-0 w-full" ref={containerRef}>
      {/* Label */}
      <span
        className={cn(
          "text-sm font-semibold tracking-wide uppercase",
          selectedTrack ? "text-muted-foreground" : accentStyles.label
        )}
      >
        {label}
      </span>

      {selectedTrack ? (
        /* Selected state */
        <div className="relative flex items-center gap-3 p-3 rounded-xl border border-border min-w-0 w-full overflow-hidden">
          {selectedTrack.image ? (
            <>
              <img
                src={selectedTrack.image}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover blur-md opacity-25 scale-110"
              />
              <div className="absolute inset-0 bg-black/65" aria-hidden="true" />
            </>
          ) : (
            <div className="absolute inset-0 bg-surface-raised" aria-hidden="true" />
          )}

          <div className="relative z-10 flex items-center gap-3 min-w-0 w-full">
            {selectedTrack.image ? (
              <img
                src={selectedTrack.image}
                alt={`${selectedTrack.album} album art`}
                className="size-10 rounded-md object-cover flex-shrink-0 ring-1 ring-white/10"
              />
            ) : (
              <div className="size-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0 ring-1 ring-white/10">
                <Music className="size-4 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0 overflow-hidden">
              <p
                className="font-semibold text-sm truncate text-foreground"
                title={selectedTrack.name}
              >
                {selectedTrack.name}
              </p>
              <p
                className="text-xs text-muted-foreground truncate"
                title={selectedTrack.artist}
              >
                {selectedTrack.artist}
              </p>
              <p
                className="text-xs text-muted-foreground/70 truncate"
                title={selectedTrack.album}
              >
                {selectedTrack.album}
              </p>
            </div>
            <button
              type="button"
              onClick={handleFavoriteClick}
              aria-label={favorited ? "Remove from favorites" : "Save to favorites"}
              aria-pressed={favorited}
              className={cn(
                "flex-shrink-0 size-7 rounded-full flex items-center justify-center transition-colors",
                favorited
                  ? "text-rose-400 hover:text-rose-300 hover:bg-white/10"
                  : "text-muted-foreground hover:text-rose-400 hover:bg-white/10"
              )}
            >
              <Heart className={cn("size-4", favorited && "fill-current")} />
            </button>
            <button
              onClick={onClear}
              aria-label="Remove track"
              className="flex-shrink-0 size-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Search input + dropdown */
        <div className="relative">
          <div
            className={cn(
              "flex items-center rounded-xl border bg-surface ring-2 ring-transparent transition-all",
              accentStyles.ring,
              accentStyles.border,
              "border-border"
            )}
          >
            {loading ? (
              <Loader2 className="ml-3 size-4 text-muted-foreground animate-spin flex-shrink-0" />
            ) : (
              <Search className="ml-3 size-4 text-muted-foreground flex-shrink-0" />
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              placeholder={`Search for a track...`}
              className="flex-1 bg-transparent px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
              aria-label={`Search for ${label}`}
              aria-autocomplete="list"
              aria-expanded={open}
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                  setIsRecent(false);
                }}
                className="mr-2 size-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Dropdown */}
          {open && results.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border border-border bg-popover shadow-2xl overflow-hidden"
              role="listbox"
              aria-label={isRecent ? "Recently played tracks" : "Search results"}
            >
              {isRecent && (
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
                      idx === focusedIndex ? (
                        accentColor === "purple" ? "bg-[#a855f7]/15" : "bg-[#3b82f6]/15"
                      ) : accentStyles.hover,
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

          {open && query.length >= 2 && results.length === 0 && !loading && (
            <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border border-border bg-popover shadow-2xl p-6 text-center">
              <p className="text-sm text-muted-foreground">No tracks found for &ldquo;{query}&rdquo;</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
