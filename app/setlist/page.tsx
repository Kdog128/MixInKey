"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ListMusic, Loader2, Save, Disc3, FolderOpen, Trash2 } from "lucide-react";
import { TrackSearch, type TrackResult } from "@/components/track-search";
import { SetlistTrackList } from "@/components/setlist-track-list";
import {
  addTrackToSetlist,
  buildSetlistTrack,
  clearSetlistTracks,
  formatSetDuration,
  getSetlistTracks,
  removeTrackFromSetlist,
  reorderSetlistTracks,
  setSetlistTracks,
  type SetlistTrack,
} from "@/lib/setlist";
import type { TrackFeatures } from "@/components/compatibility-card";
import { cn } from "@/lib/utils";

async function fetchTrackFeatures(track: TrackResult): Promise<Pick<TrackFeatures, "bpm" | "musical_key" | "camelot">> {
  const res = await fetch("/api/spotify/features", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tracks: [track] }),
  });
  const data = await res.json();
  if (!res.ok || !data.features?.[0]) {
    throw new Error(data.error ?? "Failed to fetch track data");
  }
  const features = data.features[0] as TrackFeatures;
  return {
    bpm: features.bpm,
    musical_key: features.musical_key,
    camelot: features.camelot,
  };
}

interface SavedSetlist {
  id: string;
  name: string;
  created_at: string;
  track_count: number;
}

function formatSavedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function SetlistPage() {
  const [tracks, setTracks] = useState<SetlistTrack[]>([]);
  const [setlistName, setSetlistName] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [savedSets, setSavedSets] = useState<SavedSetlist[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchKey, setSearchKey] = useState(0);
  const [loadingSetId, setLoadingSetId] = useState<string | null>(null);
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);

  const loadSavedSetlists = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const res = await fetch("/api/setlists");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load saved sets");
      }
      setSavedSets(data.setlists ?? []);
    } catch {
      setSavedSets([]);
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    setTracks(getSetlistTracks());
    void loadSavedSetlists();

    function syncFromStorage() {
      setTracks(getSetlistTracks());
    }

    window.addEventListener("focus", syncFromStorage);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener("focus", syncFromStorage);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, [loadSavedSetlists]);

  const persistTracks = useCallback((next: SetlistTrack[]) => {
    setSetlistTracks(next);
    setTracks(next);
  }, []);

  const handleAddTrack = useCallback(async (track: TrackResult) => {
    setAdding(true);
    setError(null);
    setMessage(null);
    try {
      const features = await fetchTrackFeatures(track);
      const entry = buildSetlistTrack(track, features);
      const { tracks: updated, added } = addTrackToSetlist(entry);
      persistTracks(updated);
      if (added) {
        setMessage(`Added "${track.name}" to set`);
        setSearchKey((k) => k + 1);
      } else {
        setError(`"${track.name}" is already in the set`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add track");
    } finally {
      setAdding(false);
    }
  }, [persistTracks]);

  async function handleLoadSet(id: string, name: string) {
    setLoadingSetId(id);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/setlists/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load setlist");
      }

      const loadedTracks = (data.tracks ?? []) as SetlistTrack[];
      persistTracks(loadedTracks);
      setSetlistName(data.name ?? name);
      setMessage(`Loaded "${data.name ?? name}" with ${loadedTracks.length} tracks`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load setlist");
    } finally {
      setLoadingSetId(null);
    }
  }

  async function handleDeleteSet(id: string) {
    setDeletingSetId(id);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/setlists/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to delete setlist");
      }

      setSavedSets((prev) => prev.filter((set) => set.id !== id));
      setMessage("Setlist deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete setlist");
    } finally {
      setDeletingSetId(null);
    }
  }

  function handleRemove(spotifyId: string) {
    persistTracks(removeTrackFromSetlist(spotifyId));
    setMessage(null);
    setError(null);
  }

  function handleReorder(fromIndex: number, toIndex: number) {
    persistTracks(reorderSetlistTracks(fromIndex, toIndex));
  }

  async function handleSave() {
    const name = setlistName.trim();
    if (!name) {
      setError("Enter a name for your setlist");
      return;
    }
    if (tracks.length === 0) {
      setError("Add at least one track before saving");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/setlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          tracks: tracks.map((t) => ({
            spotify_id: t.spotify_id,
            position: t.position,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save setlist");
      }

      clearSetlistTracks();
      setTracks([]);
      setSetlistName("");
      setMessage(`Saved "${name}" with ${data.trackCount} tracks`);
      void loadSavedSetlists();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save setlist");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-background font-sans">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(168,85,247,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(168,85,247,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
        aria-hidden="true"
      />
      <div
        className="fixed top-0 left-1/3 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-12 flex flex-col gap-8">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Compatibility Tool
            </Link>
            <Link
              href="/"
              className="text-xs font-semibold tracking-wide uppercase text-[#a855f7] hover:text-[#c084fc] transition-colors"
            >
              DJ Mix Compatibility
            </Link>
          </div>

          <div className="flex items-start gap-4">
            <div
              className="flex items-center justify-center size-14 rounded-2xl border flex-shrink-0"
              style={{
                borderColor: "rgba(168,85,247,0.3)",
                background: "rgba(168,85,247,0.1)",
                boxShadow: "0 0 24px rgba(168,85,247,0.2)",
              }}
            >
              <ListMusic className="size-7" style={{ color: "#a855f7" }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                Set Planner
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Build and reorder your DJ set — drag tracks to plan your flow.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-raised px-4 py-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Disc3 className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Tracks:</span>
              <span className="font-semibold text-foreground">{tracks.length}</span>
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="text-sm">
              <span className="text-muted-foreground">Est. duration:</span>{" "}
              <span className="font-semibold text-foreground">
                {formatSetDuration(tracks.length)}
              </span>
              <span className="text-xs text-muted-foreground/60 ml-1">(~6 min/track)</span>
            </div>
          </div>
        </header>

        <section
          className="rounded-2xl border border-border bg-card p-5 md:p-6 flex flex-col gap-5"
          style={{ boxShadow: "0 0 40px rgba(0,0,0,0.5)" }}
        >
          <div className="relative">
            <TrackSearch
              key={searchKey}
              label="Add Track"
              accentColor="purple"
              selectedTrack={null}
              onSelect={handleAddTrack}
              onClear={() => {}}
              enableFavoritesFilter
            />
            {adding && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-sm">
                <Loader2 className="size-5 animate-spin text-[#a855f7]" />
              </div>
            )}
          </div>

          <div className="hidden sm:grid grid-cols-[auto_auto_auto_1fr_auto_auto_auto_auto_auto] gap-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground border-b border-border/50 pb-2">
            <span className="w-4" />
            <span className="w-10" />
            <span className="w-6 text-center">#</span>
            <span>Track</span>
            <span className="w-10 text-right">BPM</span>
            <span className="w-12 text-center">Camelot</span>
            <span className="w-24 text-right">Mix</span>
            <span className="w-16" />
          </div>

          <SetlistTrackList
            tracks={tracks}
            onReorder={handleReorder}
            onRemove={handleRemove}
          />
        </section>

        <section
          className="rounded-2xl border border-border bg-card p-5 md:p-6 flex flex-col gap-4"
          style={{ boxShadow: "0 0 40px rgba(0,0,0,0.5)" }}
        >
          <h2 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            Save to Supabase
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={setlistName}
              onChange={(e) => setSetlistName(e.target.value)}
              placeholder="Setlist name (e.g. Friday Warm-Up)"
              className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[#a855f7]/60 focus:ring-2 focus:ring-[#a855f7]/20"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || tracks.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#a855f7]/40 bg-[#a855f7]/15 px-5 py-3 text-sm font-semibold text-[#c084fc] transition-colors hover:bg-[#a855f7]/25 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save Setlist
            </button>
          </div>
        </section>

        <section
          className="rounded-2xl border border-border bg-card p-5 md:p-6 flex flex-col gap-4"
          style={{ boxShadow: "0 0 40px rgba(0,0,0,0.5)" }}
        >
          <div className="flex items-center gap-2">
            <FolderOpen className="size-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              Saved Sets
            </h2>
          </div>

          {loadingSaved ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : savedSets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No saved sets yet — save your current setlist above.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {savedSets.map((set) => {
                const isLoading = loadingSetId === set.id;
                const isDeleting = deletingSetId === set.id;

                return (
                  <div
                    key={set.id}
                    className="flex items-center gap-2 rounded-xl border border-border bg-surface-raised px-2 py-2 sm:px-3"
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadSet(set.id, set.name)}
                      disabled={isLoading || isDeleting}
                      className={cn(
                        "flex flex-1 items-center justify-between gap-3 min-w-0 rounded-lg px-2 py-1.5 text-left transition-colors",
                        "hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{set.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatSavedDate(set.created_at)}
                        </p>
                      </div>
                      <span className="flex-shrink-0 flex items-center gap-2">
                        {isLoading ? (
                          <Loader2 className="size-4 animate-spin text-[#a855f7]" />
                        ) : (
                          <span className="text-xs font-mono px-2 py-1 rounded-full border border-border bg-white/5 text-muted-foreground">
                            {set.track_count} {set.track_count === 1 ? "track" : "tracks"}
                          </span>
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSet(set.id)}
                      disabled={isLoading || isDeleting}
                      aria-label={`Delete ${set.name}`}
                      className="flex-shrink-0 size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isDeleting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {message && (
          <p className="text-sm text-center text-emerald-400">{message}</p>
        )}
        {error && (
          <p className="text-sm text-center text-red-400">{error}</p>
        )}
      </div>
    </main>
  );
}
