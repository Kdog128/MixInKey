"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ListMusic, Loader2, Save, Disc3, FolderOpen, Trash2, FilePlus, ChevronDown, CheckCircle2, Pencil } from "lucide-react";
import { TrackSearch, type TrackResult } from "@/components/track-search";
import { SetlistTrackList } from "@/components/setlist-track-list";
import { EnergyArc } from "@/components/energy-arc";
import { AppShell } from "@/components/app-shell";
import {
  addTrackToSetlist,
  buildSetlistTrack,
  clearSetlistTracks,
  formatSetDuration,
  getSetlistTracks,
  removeTrackFromSetlist,
  reorderSetlistTracks,
  setSetlistTracks,
  normalizeSetlistTrack,
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
  const [loadedSetlistId, setLoadedSetlistId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [savedSets, setSavedSets] = useState<SavedSetlist[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchKey, setSearchKey] = useState(0);
  const [loadingSetId, setLoadingSetId] = useState<string | null>(null);
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);
  const [showNewSetConfirm, setShowNewSetConfirm] = useState(false);
  const [savedSetsOpen, setSavedSetsOpen] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState("");
  const [saveModalError, setSaveModalError] = useState<string | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameModalName, setRenameModalName] = useState("");
  const [renameModalError, setRenameModalError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [saveSuccessFading, setSaveSuccessFading] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState("Saved to Supabase ✓");
  const savedSetsRef = useRef<HTMLDivElement>(null);
  const saveNameInputRef = useRef<HTMLInputElement>(null);
  const renameNameInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!savedSetsOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (savedSetsRef.current && !savedSetsRef.current.contains(e.target as Node)) {
        setSavedSetsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [savedSetsOpen]);

  useEffect(() => {
    if (!showSaveModal) return;
    saveNameInputRef.current?.focus();
    saveNameInputRef.current?.select();
  }, [showSaveModal]);

  useEffect(() => {
    if (!showRenameModal) return;
    renameNameInputRef.current?.focus();
    renameNameInputRef.current?.select();
  }, [showRenameModal]);

  useEffect(() => {
    if (!showSaveSuccess || saveSuccessFading) return;

    const fadeTimer = window.setTimeout(() => setSaveSuccessFading(true), 3000);
    const hideTimer = window.setTimeout(() => {
      setShowSaveSuccess(false);
      setSaveSuccessFading(false);
    }, 3500);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [showSaveSuccess, saveSuccessFading]);

  const pageTitle = setlistName.trim() || "Set Planner";
  const hasNamedSet = setlistName.trim().length > 0;

  useEffect(() => {
    document.title =
      pageTitle === "Set Planner"
        ? "Set Planner | DJ Mix Compatibility"
        : `${pageTitle} | Set Planner`;
  }, [pageTitle]);

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

      const loadedTracks = ((data.tracks ?? []) as SetlistTrack[]).map((track) =>
        normalizeSetlistTrack({
          ...track,
          image: track.image?.trim() || null,
        })
      );
      persistTracks(loadedTracks);
      setSetlistName(data.name ?? name);
      setLoadedSetlistId(data.id ?? id);
      setMessage(`Loaded "${data.name ?? name}" with ${loadedTracks.length} tracks`);
      setSavedSetsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load setlist");
    } finally {
      setLoadingSetId(null);
    }
  }

  async function handleDeleteSet(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
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
      if (loadedSetlistId === id) {
        setLoadedSetlistId(null);
        setSetlistName("");
      }
      setMessage(`Deleted "${data.name ?? "setlist"}"`);
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

  const handleBpmChange = useCallback(
    (trackIndex: number, newBpm: number) => {
      const next = tracks.map((track, index) =>
        index === trackIndex
          ? {
              ...track,
              bpm: Math.max(1, Math.round(newBpm)),
              original_bpm: track.original_bpm ?? track.bpm,
            }
          : track
      );
      persistTracks(next);
    },
    [tracks, persistTracks]
  );

  function handleNewSetClick() {
    if (tracks.length === 0 && !setlistName.trim()) return;
    setShowNewSetConfirm(true);
  }

  function handleConfirmNewSet() {
    clearSetlistTracks();
    setTracks([]);
    setSetlistName("");
    setLoadedSetlistId(null);
    setSaveModalName("");
    setRenameModalName("");
    setShowRenameModal(false);
    setSearchKey((k) => k + 1);
    setMessage(null);
    setError(null);
    setShowNewSetConfirm(false);
  }

  function handleSaveClick() {
    if (tracks.length === 0) {
      setError("Add at least one track before saving");
      return;
    }

    if (loadedSetlistId !== null) {
      if (!setlistName.trim()) {
        setError("Name your setlist before saving");
        return;
      }
      void performSave(setlistName.trim());
      return;
    }

    setSaveModalError(null);
    setSaveModalName(setlistName);
    setShowSaveModal(true);
  }

  function handleRenameClick() {
    setRenameModalError(null);
    setRenameModalName(setlistName);
    setShowRenameModal(true);
  }

  async function performSave(name: string, options?: { closeSaveModal?: boolean }) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      if (options?.closeSaveModal) {
        setSaveModalError("Enter a name for your setlist");
      } else {
        setError("Enter a name for your setlist");
      }
      return;
    }
    if (tracks.length === 0) {
      if (options?.closeSaveModal) {
        setSaveModalError("Add at least one track before saving");
      } else {
        setError("Add at least one track before saving");
      }
      return;
    }

    setSaving(true);
    setSaveModalError(null);
    setError(null);
    setMessage(null);

    try {
      const trackPayload = tracks.map((t) => ({
        spotify_id: t.spotify_id,
        position: t.position,
      }));

      const isUpdate = loadedSetlistId !== null;
      const res = isUpdate
        ? await fetch(`/api/setlists/${encodeURIComponent(loadedSetlistId)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmedName, tracks: trackPayload }),
          })
        : await fetch("/api/setlists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmedName, tracks: trackPayload }),
          });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? (isUpdate ? "Failed to update setlist" : "Failed to save setlist"));
      }

      setSetlistName(trimmedName);
      setLoadedSetlistId(typeof data.id === "string" ? data.id : loadedSetlistId);
      if (options?.closeSaveModal) {
        setShowSaveModal(false);
        setSaveModalName("");
      }
      setSaveSuccessMessage(isUpdate ? "Updated in Supabase ✓" : "Saved to Supabase ✓");
      setSaveSuccessFading(false);
      setShowSaveSuccess(true);
      void loadSavedSetlists();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save setlist";
      if (options?.closeSaveModal) {
        setSaveModalError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    await performSave(saveModalName, { closeSaveModal: true });
  }

  async function handleRename() {
    const name = renameModalName.trim();
    if (!name) {
      setRenameModalError("Enter a name for your setlist");
      return;
    }

    setRenaming(true);
    setRenameModalError(null);
    setError(null);
    setMessage(null);

    try {
      if (loadedSetlistId !== null && tracks.length > 0) {
        const trackPayload = tracks.map((t) => ({
          spotify_id: t.spotify_id,
          position: t.position,
        }));
        const res = await fetch(`/api/setlists/${encodeURIComponent(loadedSetlistId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, tracks: trackPayload }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to rename setlist");
        }
        void loadSavedSetlists();
      }

      setSetlistName(name);
      setShowRenameModal(false);
      setRenameModalName("");
    } catch (err) {
      setRenameModalError(err instanceof Error ? err.message : "Failed to rename setlist");
    } finally {
      setRenaming(false);
    }
  }

  return (
    <AppShell>
    <main className="min-h-screen font-sans">
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

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-12 flex flex-col gap-8 min-w-0 w-full">
        <header className="flex flex-col gap-4">
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
            <div className="min-w-0 flex-1">
              <div className="flex items-center min-w-0">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground truncate">
                  {pageTitle}
                </h1>
                {hasNamedSet && (
                  <button
                    type="button"
                    onClick={handleRenameClick}
                    aria-label="Rename setlist"
                    className="flex-shrink-0 ml-4 inline-flex items-center justify-center size-8 rounded-lg border border-border bg-surface text-muted-foreground hover:text-[#c084fc] hover:border-[#a855f7]/40 hover:bg-[#a855f7]/10 transition-colors"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Build and reorder your DJ set — drag tracks to plan your flow.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-raised px-4 py-3 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
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
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative" ref={savedSetsRef}>
                <button
                  type="button"
                  onClick={() => {
                    setSavedSetsOpen((open) => {
                      const next = !open;
                      if (next) void loadSavedSetlists();
                      return next;
                    });
                  }}
                  aria-expanded={savedSetsOpen}
                  aria-haspopup="listbox"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    savedSetsOpen
                      ? "border-[#a855f7]/40 bg-[#a855f7]/10 text-[#c084fc]"
                      : "border-border bg-surface hover:border-[#a855f7]/40 hover:bg-[#a855f7]/10 hover:text-[#c084fc]"
                  )}
                >
                  <FolderOpen className="size-4" />
                  Saved Sets
                  <ChevronDown
                    className={cn(
                      "size-3.5 opacity-60 transition-transform",
                      savedSetsOpen && "rotate-180"
                    )}
                  />
                </button>

                {savedSetsOpen && (
                  <div
                    className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover shadow-2xl overflow-hidden"
                    role="listbox"
                    aria-label="Saved sets"
                  >
                    <div className="px-3 py-2 border-b border-border/50">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Saved Sets
                      </p>
                    </div>

                    {loadingSaved ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : savedSets.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center px-4 py-6">
                        No saved sets yet — save your current setlist with the Save button.
                      </p>
                    ) : (
                      <div className="max-h-72 overflow-y-auto divide-y divide-border/50">
                        {savedSets.map((set) => {
                          const isLoading = loadingSetId === set.id;
                          const isDeleting = deletingSetId === set.id;

                          return (
                            <div
                              key={set.id}
                              className="flex items-center gap-2 px-3 py-2.5"
                              role="option"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">
                                  {set.name}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {formatSavedDate(set.created_at)} · {set.track_count}{" "}
                                  {set.track_count === 1 ? "track" : "tracks"}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleLoadSet(set.id, set.name)}
                                disabled={isLoading || isDeleting}
                                className="flex-shrink-0 inline-flex items-center justify-center rounded-lg border border-[#a855f7]/40 bg-[#a855f7]/15 px-2.5 py-1.5 text-xs font-semibold text-[#c084fc] hover:bg-[#a855f7]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-w-[3.25rem]"
                              >
                                {isLoading ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  "Load"
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteSet(set.id, e)}
                                disabled={isLoading || isDeleting}
                                aria-label={`Delete ${set.name}`}
                                className="flex-shrink-0 size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {isDeleting ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="size-3.5" />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveClick}
                disabled={tracks.length === 0 || saving}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400 transition-colors",
                  "hover:border-emerald-400/50 hover:bg-emerald-500/20 hover:text-emerald-300",
                  "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-emerald-500/30 disabled:hover:bg-emerald-500/10 disabled:hover:text-emerald-400"
                )}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save
              </button>

              <button
                type="button"
                onClick={handleNewSetClick}
                disabled={tracks.length === 0 && !setlistName.trim()}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors",
                  "hover:border-[#a855f7]/40 hover:bg-[#a855f7]/10 hover:text-[#c084fc]",
                  "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-surface disabled:hover:text-muted-foreground"
                )}
              >
                <FilePlus className="size-4" />
                New Set
              </button>
            </div>
          </div>
        </header>

        <section
          className="rounded-2xl border border-border bg-card p-5 md:p-6"
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
        </section>

        <section
          className="rounded-2xl border border-[#a855f7]/20 bg-card p-4 md:p-6 min-w-0"
          style={{ boxShadow: "0 0 60px rgba(168,85,247,0.1)" }}
        >
          <EnergyArc tracks={tracks} onBpmChange={handleBpmChange} />
        </section>

        <section
          className="rounded-2xl border border-border bg-card p-5 md:p-6 flex flex-col gap-4"
          style={{ boxShadow: "0 0 40px rgba(0,0,0,0.5)" }}
        >
          <h2 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            Track List
          </h2>

          <SetlistTrackList
            tracks={tracks}
            onReorder={handleReorder}
            onRemove={handleRemove}
          />
        </section>

        {message && (
          <p className="text-sm text-center text-emerald-400">{message}</p>
        )}
        {error && (
          <p className="text-sm text-center text-red-400">{error}</p>
        )}
      </div>

      {showSaveSuccess && (
        <div
          className={cn(
            "save-success-toast fixed top-4 left-1/2 z-[60] pointer-events-none flex items-center gap-2 rounded-lg border border-emerald-400/35 bg-emerald-950/90 px-3 py-2 backdrop-blur-sm",
            saveSuccessFading && "save-success-toast-fade-out"
          )}
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="save-success-check size-4 text-emerald-400 flex-shrink-0" />
          <span className="text-sm font-medium text-emerald-100">
            {saveSuccessMessage}
          </span>
        </div>
      )}

      {showSaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-set-dialog-title"
        >
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              if (!saving) {
                setShowSaveModal(false);
                setSaveModalError(null);
              }
            }}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2
              id="save-set-dialog-title"
              className="text-lg font-semibold text-foreground"
            >
              Save Set
            </h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Name your set before saving {tracks.length}{" "}
              {tracks.length === 1 ? "track" : "tracks"} to Supabase.
            </p>
            <input
              ref={saveNameInputRef}
              type="text"
              value={saveModalName}
              onChange={(e) => {
                setSaveModalName(e.target.value);
                setSaveModalError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) void handleSave();
              }}
              placeholder="Setlist name (e.g. Friday Warm-Up)"
              disabled={saving}
              className="mt-4 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
            />
            {saveModalError && (
              <p className="mt-2 text-sm text-red-400">{saveModalError}</p>
            )}
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowSaveModal(false);
                  setSaveModalError(null);
                }}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-raised transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save to Supabase
              </button>
            </div>
          </div>
        </div>
      )}

      {showRenameModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-set-dialog-title"
        >
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              if (!renaming) {
                setShowRenameModal(false);
                setRenameModalError(null);
              }
            }}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2
              id="rename-set-dialog-title"
              className="text-lg font-semibold text-foreground"
            >
              Rename setlist
            </h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Update the name shown in the header
              {loadedSetlistId ? " and in Supabase" : ""}.
            </p>
            <input
              ref={renameNameInputRef}
              type="text"
              value={renameModalName}
              onChange={(e) => {
                setRenameModalName(e.target.value);
                setRenameModalError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !renaming) void handleRename();
              }}
              placeholder="Setlist name"
              disabled={renaming}
              className="mt-4 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[#a855f7]/60 focus:ring-2 focus:ring-[#a855f7]/20 disabled:opacity-60"
            />
            {renameModalError && (
              <p className="mt-2 text-sm text-red-400">{renameModalError}</p>
            )}
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRenameModal(false);
                  setRenameModalError(null);
                }}
                disabled={renaming}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-raised transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRename()}
                disabled={renaming}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#a855f7]/40 bg-[#a855f7]/15 px-4 py-2.5 text-sm font-semibold text-[#c084fc] hover:bg-[#a855f7]/25 transition-colors disabled:opacity-60"
              >
                {renaming ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Pencil className="size-4" />
                )}
                Save name
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewSetConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-set-dialog-title"
        >
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowNewSetConfirm(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2
              id="new-set-dialog-title"
              className="text-lg font-semibold text-foreground"
            >
              Start a new set?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              This will clear your current setlist
              {setlistName.trim() ? ` "${setlistName.trim()}"` : ""} with{" "}
              {tracks.length} {tracks.length === 1 ? "track" : "tracks"}. Unsaved
              changes will be lost.
            </p>
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewSetConfirm(false)}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-raised transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmNewSet}
                className="inline-flex items-center justify-center rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/25 transition-colors"
              >
                Clear &amp; Start New
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
    </AppShell>
  );
}
