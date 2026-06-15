/**
 * ReccoBeats API — no API key required.
 * - Audio features: GET https://api.reccobeats.com/v1/audio-features?ids={spotifyIds}
 * - Track metadata: GET https://api.reccobeats.com/v1/track?ids={spotifyIds}
 */
import { getCamelotKey, type CamelotKey } from "@/lib/camelot";
import type { AudioAnalysis } from "@/lib/audio-analysis";

const AUDIO_FEATURES_URL = "https://api.reccobeats.com/v1/audio-features";
const TRACK_URL = "https://api.reccobeats.com/v1/track";

interface ReccoBeatsFeature {
  id?: string;
  href?: string;
  tempo?: number;
  key?: number;
  mode?: number;
  popularity?: number;
}

interface ReccoBeatsTrackArtist {
  name?: string;
  href?: string;
  genres?: string[];
}

interface ReccoBeatsTrack {
  href?: string;
  popularity?: number;
  genres?: string[];
  artists?: ReccoBeatsTrackArtist[];
}

export interface ReccoBeatsTrackData {
  analysis: AudioAnalysis | null;
  popularity: number | null;
  genres: string[];
}

function spotifyIdFromHref(href: string): string | null {
  const match = href.match(/track\/([a-zA-Z0-9]+)/);
  return match?.[1] ?? null;
}

function parsePopularity(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 100) return null;
  return rounded;
}

function featureToAnalysis(feature: ReccoBeatsFeature): AudioAnalysis {
  const pitch = feature.key;
  const mode = feature.mode;
  const camelot: CamelotKey | null =
    pitch != null && mode != null && pitch >= 0 && pitch <= 11 && (mode === 0 || mode === 1)
      ? getCamelotKey(pitch, mode)
      : null;

  const bpm =
    feature.tempo != null && Number.isFinite(feature.tempo) && feature.tempo > 0
      ? Math.round(feature.tempo)
      : null;

  return {
    bpm,
    musicalKey: camelot?.musicalKey ?? null,
    camelot,
    source: "reccobeats",
    popularity: parsePopularity(feature.popularity),
    genres: [],
  };
}

function extractGenres(track: ReccoBeatsTrack): string[] {
  const fromTrack = track.genres ?? [];
  const fromArtists = (track.artists ?? []).flatMap((artist) => artist.genres ?? []);
  return [...new Set([...fromTrack, ...fromArtists].map((g) => g.trim()).filter(Boolean))];
}

function emptyTrackData(): ReccoBeatsTrackData {
  return { analysis: null, popularity: null, genres: [] };
}

async function fetchReccoBeatsTrackMetadata(
  spotifyIds: string[]
): Promise<Map<string, { popularity: number | null; genres: string[] }>> {
  const result = new Map<string, { popularity: number | null; genres: string[] }>();
  if (spotifyIds.length === 0) return result;

  const url = `${TRACK_URL}?ids=${spotifyIds.map(encodeURIComponent).join(",")}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn("[reccobeats] Track metadata request failed:", { status: res.status });
      return result;
    }

    const data = (await res.json()) as { content?: ReccoBeatsTrack[] };
    for (const track of data.content ?? []) {
      const spotifyId = track.href ? spotifyIdFromHref(track.href) : null;
      if (!spotifyId) continue;
      result.set(spotifyId, {
        popularity: parsePopularity(track.popularity),
        genres: extractGenres(track),
      });
    }
  } catch (err) {
    console.error("[reccobeats] Track metadata error:", err);
  }

  return result;
}

export async function fetchReccoBeatsBySpotifyIds(
  spotifyIds: string[]
): Promise<Map<string, ReccoBeatsTrackData>> {
  const result = new Map<string, ReccoBeatsTrackData>();
  const uniqueIds = [...new Set(spotifyIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return result;

  for (const id of uniqueIds) {
    result.set(id, emptyTrackData());
  }

  const audioUrl = `${AUDIO_FEATURES_URL}?ids=${uniqueIds.map(encodeURIComponent).join(",")}`;

  try {
    const [audioRes, metadataMap] = await Promise.all([
      fetch(audioUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }),
      fetchReccoBeatsTrackMetadata(uniqueIds),
    ]);

    for (const [spotifyId, metadata] of metadataMap) {
      const entry = result.get(spotifyId) ?? emptyTrackData();
      entry.popularity = metadata.popularity;
      entry.genres = metadata.genres;
      result.set(spotifyId, entry);
    }

    if (!audioRes.ok) {
      console.warn("[reccobeats] Audio features request failed:", {
        status: audioRes.status,
        count: uniqueIds.length,
      });
      return result;
    }

    const data = (await audioRes.json()) as { content?: ReccoBeatsFeature[] };
    for (const feature of data.content ?? []) {
      const spotifyId = feature.href ? spotifyIdFromHref(feature.href) : null;
      if (!spotifyId) continue;

      const analysis = featureToAnalysis(feature);
      const entry = result.get(spotifyId) ?? emptyTrackData();

      if (analysis.popularity == null && entry.popularity != null) {
        analysis.popularity = entry.popularity;
      } else if (analysis.popularity != null && entry.popularity == null) {
        entry.popularity = analysis.popularity;
      }

      if (entry.genres.length > 0) {
        analysis.genres = entry.genres;
      }

      if (analysis.bpm != null || analysis.camelot != null) {
        entry.analysis = analysis;
        console.log("[reccobeats] Match:", {
          spotifyId,
          bpm: analysis.bpm,
          key: analysis.musicalKey,
          camelot: analysis.camelot?.label,
          popularity: entry.popularity ?? analysis.popularity,
          genres: entry.genres,
        });
      }

      result.set(spotifyId, entry);
    }

    const withData = [...result.values()].filter(
      (entry) => entry.analysis != null || entry.popularity != null || entry.genres.length > 0
    );
    if (withData.length === 0) {
      console.log("[reccobeats] No features returned for ids:", uniqueIds);
    }
  } catch (err) {
    console.error("[reccobeats] Request error:", err);
  }

  return result;
}
