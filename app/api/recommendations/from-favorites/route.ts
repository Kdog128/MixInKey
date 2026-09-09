import { NextRequest, NextResponse } from "next/server";
import { parseMusicalKeyString } from "@/lib/camelot";
import {
  FAVORITE_RECS_PER_SEED,
  rankNextTracksFromCacheRows,
  type CacheNextTrackInput,
  type CacheNextTrackResult,
} from "@/lib/next-track-cache";
import { getCachedTracksWithBpmAndKey } from "@/lib/tracks-cache";

const MAX_SEEDS = 25;

interface FavoriteSeedInput extends CacheNextTrackInput {
  name?: string;
  artist?: string;
  image?: string | null;
}

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

function parseSeeds(raw: unknown): FavoriteSeedInput[] {
  if (!Array.isArray(raw)) return [];
  const seeds: FavoriteSeedInput[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const seed = item as Record<string, unknown>;
    const spotifyId = typeof seed.spotify_id === "string" ? seed.spotify_id.trim() : "";
    const camelot = typeof seed.camelot === "string" ? seed.camelot.trim() : "";
    const bpm = typeof seed.bpm === "number" && Number.isFinite(seed.bpm) ? seed.bpm : null;
    if (!spotifyId || !camelot || bpm == null || seen.has(spotifyId)) continue;
    seen.add(spotifyId);
    seeds.push({
      spotify_id: spotifyId,
      camelot,
      bpm,
      name: typeof seed.name === "string" ? seed.name.trim() : "",
      artist: typeof seed.artist === "string" ? seed.artist.trim() : "",
      image: typeof seed.image === "string" ? seed.image.trim() || null : null,
    });
    if (seeds.length >= MAX_SEEDS) break;
  }

  return seeds;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { seeds?: unknown };
    const seeds = parseSeeds(body.seeds);
    if (seeds.length === 0) {
      return NextResponse.json({ groups: [] as RecommendationGroup[] });
    }

    const rows = await getCachedTracksWithBpmAndKey();
    const excludeIds = new Set(seeds.map((seed) => seed.spotify_id));
    const groups: RecommendationGroup[] = [];

    for (const seed of seeds) {
      const track2Key = parseMusicalKeyString(seed.camelot);
      const cacheRow = rows.find((row) => row.spotify_id === seed.spotify_id);
      const groupSeed = {
        spotify_id: seed.spotify_id,
        name: seed.name || cacheRow?.title?.trim() || "Unknown Track",
        artist: seed.artist || cacheRow?.artist?.trim() || "Unknown Artist",
        image: seed.image || cacheRow?.artwork_url?.trim() || null,
        bpm: seed.bpm,
        camelot: seed.camelot,
      };

      if (!track2Key) {
        groups.push({ seed: groupSeed, tracks: [] });
        continue;
      }

      const tracks = rankNextTracksFromCacheRows(
        seed,
        track2Key,
        rows,
        excludeIds,
        FAVORITE_RECS_PER_SEED
      );
      for (const track of tracks) {
        excludeIds.add(track.spotify_id);
      }
      groups.push({ seed: groupSeed, tracks });
    }

    return NextResponse.json({ groups });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[recommendations/from-favorites] Unhandled error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
