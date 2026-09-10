"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Disc3, Heart, ListPlus, Loader2 } from "lucide-react";
import { CompatibleTrackRow } from "@/components/compatible-track-row";
import { PageHeader } from "@/components/page-header";
import { SourceBadgesFooter } from "@/components/source-badges-footer";
import { getTransitionAnalysis, parseMusicalKeyString } from "@/lib/camelot";
import { compatibilityPairHref } from "@/lib/compatibility-pair";
import {
  enrichFavoritesWithAnalysis,
  enrichFavoritesWithImages,
  hydrateFavoritesFromServer,
  type FavoriteTrack,
} from "@/lib/favorites";
import { addTrackToSetlist, buildSetlistTrack } from "@/lib/setlist";
import {
  PAGE_CONTENT_CLASS,
  PAGE_SECTION_CARD_CLASS,
  cohesiveCardStyle,
} from "@/lib/ui-surfaces";
import { cn } from "@/lib/utils";
import type { CacheNextTrackResult } from "@/lib/next-track-cache";

interface RecommendationGroup {
  seed: {
    spotify_id: string;
    name: string;
    artist: string;
    image: string | null;
    bpm: number;
    camelot: string;
  };
  tracks: CacheNextTrackResult[];
}

const ACTION_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#a855f7]/30 bg-[#a855f7]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#c084fc] transition-[colors,box-shadow,border-color] hover:border-[#a855f7]/50 hover:bg-[#a855f7]/20 hover:shadow-[0_0_16px_rgba(168,85,247,0.4)] disabled:opacity-40 disabled:cursor-not-allowed";

function favoriteHasMixData(track: FavoriteTrack): boolean {
  return track.bpm != null && Boolean(track.camelot?.trim());
}

function addRecommendedToSet(track: CacheNextTrackResult): boolean {
  const camelot = parseMusicalKeyString(track.camelot);
  const { added } = addTrackToSetlist(
    buildSetlistTrack(
      {
        id: track.spotify_id,
        name: track.name,
        artist: track.artist,
        artist_id: null,
        album: "",
        image: track.image,
        preview_url: null,
        duration_ms: 0,
        popularity: 0,
        explicit: false,
        release_date: null,
      },
      {
        bpm: track.bpm,
        musical_key: camelot?.musicalKey ?? null,
        camelot,
      }
    )
  );
  return added;
}

export default function RecommendationsPage() {
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<FavoriteTrack[]>([]);
  const [groups, setGroups] = useState<RecommendationGroup[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const enriched = await enrichFavoritesWithAnalysis(
        await enrichFavoritesWithImages(await hydrateFavoritesFromServer())
      );
      if (cancelled) return;
      setFavorites(enriched);

      const seeds = enriched.filter(favoriteHasMixData).map((favorite) => ({
        spotify_id: favorite.spotify_id,
        camelot: favorite.camelot!,
        bpm: favorite.bpm!,
        name: favorite.name,
        artist: favorite.artist,
        image: favorite.image,
      }));

      if (seeds.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/recommendations/from-favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seeds }),
        });
        const data = (await res.json()) as { groups?: RecommendationGroup[] };
        if (!cancelled) {
          setGroups(Array.isArray(data.groups) ? data.groups : []);
        }
      } catch {
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleAddToSet(track: CacheNextTrackResult) {
    setAddingId(track.spotify_id);
    const added = addRecommendedToSet(track);
    setMessage(
      added
        ? `Added "${track.name}" to set — view in Set Planner`
        : `"${track.name}" is already in your set`
    );
    setAddingId(null);
  }

  const readyFavorites = favorites.filter(favoriteHasMixData);
  const visibleGroups = groups.filter((group) => group.tracks.length > 0);

  return (
    <main className="min-h-screen font-sans">
      <div className={cn(PAGE_CONTENT_CLASS, "gap-4")}>
        <PageHeader icon="sparkles" title="Recommendations" />

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
                Favorite a track from search to see mix suggestions here.
              </p>
              <Link
                href="/favorites"
                className="mt-4 inline-flex text-sm font-medium text-[#c084fc] hover:text-[#d8b4fe]"
              >
                Go to Favorites
              </Link>
            </div>
          ) : readyFavorites.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                Favorites need BPM and key before we can recommend compatible tracks.
              </p>
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                No compatible tracks in the cache yet — analyze more tracks to grow the catalog.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 px-4 py-5 md:px-5">
              <div>
                <h2 className="text-sm font-semibold tracking-wide text-foreground">
                  Based on your favorites
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                  Top mix matches from your track cache
                </p>
              </div>

              {visibleGroups.map((group) => (
                <div key={group.seed.spotify_id} className="flex flex-col gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-semibold uppercase tracking-widest">After</span>{" "}
                    <span className="font-medium text-foreground">{group.seed.name}</span>
                  </p>
                  {group.tracks.map((track) => {
                    const transition = getTransitionAnalysis(
                      {
                        bpm: group.seed.bpm,
                        camelot_label: group.seed.camelot,
                      },
                      {
                        bpm: track.bpm,
                        camelot_label: track.camelot,
                      }
                    );

                    return (
                      <CompatibleTrackRow
                        key={`${group.seed.spotify_id}-${track.spotify_id}`}
                        track={track}
                        transition={transition}
                        actions={
                          <>
                            <Link
                              href={compatibilityPairHref(
                                group.seed.spotify_id,
                                track.spotify_id
                              )}
                              aria-label={`Open ${track.name} in Compatibility with ${group.seed.name}`}
                              className={ACTION_BUTTON_CLASS}
                            >
                              <Disc3 className="size-3.5" />
                              Mix
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleAddToSet(track)}
                              disabled={addingId === track.spotify_id}
                              className={ACTION_BUTTON_CLASS}
                            >
                              {addingId === track.spotify_id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <ListPlus className="size-3.5" />
                              )}
                              Add to Set
                            </button>
                          </>
                        }
                      />
                    );
                  })}
                </div>
              ))}

              {message ? (
                <p className="text-center text-xs text-[#c084fc]">{message}</p>
              ) : null}
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
