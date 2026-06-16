"use client";

import { useEffect, useState } from "react";
import { Heart, Loader2, Music } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  enrichFavoritesWithImages,
  getFavorites,
  type FavoriteTrack,
} from "@/lib/favorites";
import { cn } from "@/lib/utils";

function PageBackground() {
  return (
    <>
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
    </>
  );
}

function FavoriteRow({ track }: { track: FavoriteTrack }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0">
      <div className="relative size-12 flex-shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
        {track.image ? (
          <img
            src={track.image}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Music className="size-5 text-muted-foreground/50" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground" title={track.name}>
          {track.name}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={track.artist}>
          {track.artist}
        </p>
      </div>

      <div className="flex flex-shrink-0 items-center gap-4 text-sm">
        <span className="w-14 text-right tabular-nums text-foreground">
          {track.bpm != null ? Math.round(track.bpm) : "—"}
          {track.bpm != null && (
            <span className="ml-0.5 text-xs text-muted-foreground">BPM</span>
          )}
        </span>
        <span
          className={cn(
            "w-16 text-center font-mono text-xs font-semibold",
            track.key ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {track.key ?? "—"}
        </span>
      </div>
    </div>
  );
}

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const enriched = await enrichFavoritesWithImages(getFavorites());
      if (!cancelled) {
        setFavorites(enriched);
        setLoading(false);
      }
    }

    void load();

    function syncFromStorage() {
      void enrichFavoritesWithImages(getFavorites()).then((next) => {
        if (!cancelled) setFavorites(next);
      });
    }

    window.addEventListener("focus", syncFromStorage);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", syncFromStorage);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);

  return (
    <AppShell>
      <main className="min-h-screen font-sans">
        <PageBackground />

        <div className="relative z-10 mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-8 px-4 py-12">
          <header className="flex items-start gap-4">
            <div
              className="flex size-14 flex-shrink-0 items-center justify-center rounded-2xl border"
              style={{
                borderColor: "rgba(244,63,94,0.35)",
                background: "rgba(244,63,94,0.1)",
                boxShadow: "0 0 24px rgba(244,63,94,0.15)",
              }}
            >
              <Heart className="size-7" style={{ color: "#fb7185" }} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Favorites
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Tracks you&apos;ve saved from search and compatibility analysis.
              </p>
            </div>
          </header>

          <section
            className="overflow-hidden rounded-2xl border border-border bg-card"
            style={{ boxShadow: "0 0 40px rgba(0,0,0,0.5)" }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : favorites.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <Heart className="mx-auto size-8 text-muted-foreground/40" />
                <p className="mt-4 text-sm text-muted-foreground">
                  No favorites yet — heart a track in search to save it here.
                </p>
              </div>
            ) : (
              <div>
                <div className="hidden border-b border-border/50 px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground sm:grid sm:grid-cols-[3rem_minmax(0,1fr)_5.5rem_4rem] sm:items-center sm:gap-3">
                  <span aria-hidden="true" />
                  <span>Track</span>
                  <span className="text-right">BPM</span>
                  <span className="text-center">Key</span>
                </div>
                {favorites.map((track) => (
                  <FavoriteRow key={track.spotify_id} track={track} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
