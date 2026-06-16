import { getSpotifyToken } from "@/lib/spotify-auth";
import { mapSpotifyTrack, type SpotifyApiTrack } from "@/lib/spotify-track";
import { getCachedTrackRowsByIds, type TracksCacheRow } from "@/lib/tracks-cache";

export interface ResolvedTrackMetadata {
  spotify_id: string;
  name: string;
  artist: string;
  album: string;
  image: string | null;
  duration_ms: number;
}

export function resolveTrackImage(
  cacheRow: Pick<TracksCacheRow, "artwork_url"> | undefined,
  spotifyImage: string | null | undefined
): string | null {
  const fromCache = cacheRow?.artwork_url?.trim();
  if (fromCache) return fromCache;
  const fromSpotify = spotifyImage?.trim();
  if (fromSpotify) return fromSpotify;
  return null;
}

async function fetchSpotifyTracksByIds(
  ids: string[]
): Promise<Map<string, ReturnType<typeof mapSpotifyTrack>>> {
  const result = new Map<string, ReturnType<typeof mapSpotifyTrack>>();
  if (ids.length === 0) return result;

  try {
    const token = await getSpotifyToken();
    const headers = { Authorization: `Bearer ${token}` };

    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const url = `https://api.spotify.com/v1/tracks?ids=${batch.map(encodeURIComponent).join(",")}`;
      const res = await fetch(url, { headers, cache: "no-store" });

      if (!res.ok) {
        console.warn("[track-metadata] Spotify tracks fetch failed:", res.status);
        continue;
      }

      const data = (await res.json()) as { tracks: Array<SpotifyApiTrack | null> };
      for (const track of data.tracks ?? []) {
        if (track?.id) {
          result.set(track.id, mapSpotifyTrack(track));
        }
      }
    }
  } catch (err) {
    console.warn("[track-metadata] Spotify tracks fetch error:", err);
  }

  return result;
}

export async function resolveTrackMetadataByIds(
  spotifyIds: string[]
): Promise<Map<string, ResolvedTrackMetadata>> {
  const ids = [...new Set(spotifyIds.map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, ResolvedTrackMetadata>();
  if (ids.length === 0) return result;

  const [cacheRowsById, spotifyById] = await Promise.all([
    getCachedTrackRowsByIds(ids),
    fetchSpotifyTracksByIds(ids),
  ]);

  for (const spotifyId of ids) {
    const cacheRow = cacheRowsById.get(spotifyId);
    const spotify = spotifyById.get(spotifyId);

    result.set(spotifyId, {
      spotify_id: spotifyId,
      name: spotify?.name ?? cacheRow?.title ?? "Unknown Track",
      artist: spotify?.artist ?? cacheRow?.artist ?? "Unknown Artist",
      album: spotify?.album ?? "",
      image: resolveTrackImage(cacheRow, spotify?.image),
      duration_ms: spotify?.duration_ms ?? 0,
    });
  }

  return result;
}
