"use client";

import { useEffect, useState } from "react";
import { Heart, Loader2, Music } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SourceBadgesFooter } from "@/components/source-badges-footer";
import {
  enrichFavoritesWithAnalysis,
  enrichFavoritesWithImages,
  hydrateFavoritesFromServer,
  type FavoriteTrack,
} from "@/lib/favorites";
import {
  COHESIVE_INNER_CARD_CLASS,
  PAGE_CONTENT_CLASS,
  PAGE_SECTION_CARD_CLASS,
  cohesiveCardStyle,
  cohesiveSurfaceStyle,
} from "@/lib/ui-surfaces";
import { cn } from "@/lib/utils";

function FavoriteRow({ track }: { track: FavoriteTrack }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0">
      <div
        className={cn(
          "relative size-12 flex-shrink-0 overflow-hidden rounded-lg border border-border",
          COHESIVE_INNER_CARD_CLASS
        )}
        style={cohesiveSurfaceStyle()}
      >
        {track.image ? (
          <img src={track.image} alt="" className="size-full object-cover" />
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
            track.camelot ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {track.camelot ?? "—"}
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

    async function enrichAll(favorites: FavoriteTrack[]) {
      const withImages = await enrichFavoritesWithImages(favorites);
      return enrichFavoritesWithAnalysis(withImages);
    }

    async function load() {
      const hydrated = await hydrateFavoritesFromServer();
      const enriched = await enrichAll(hydrated);
      if (!cancelled) {
        setFavorites(enriched);
        setLoading(false);
      }
    }

    void load();

    function syncFromStorage() {
      void hydrateFavoritesFromServer()
        .then((hydrated) => enrichAll(hydrated))
        .then((next) => {
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
    <main className="min-h-screen font-sans">
      <div className={cn(PAGE_CONTENT_CLASS, "gap-4")}>
        <PageHeader icon="heart" title="Favorites" />

        <section
          className={cn(PAGE_SECTION_CARD_CLASS, "flex flex-col overflow-hidden p-0")}
          style={cohesiveCardStyle()}
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

          <div className="border-t border-border/50 px-4 py-3">
            <SourceBadgesFooter />
          </div>
        </section>
      </div>
    </main>
  );
}
