import type { CamelotKey } from "@/lib/camelot";
import { fetchGetSongBpmAnalysis, fetchGetSongBpmData, type GetSongBpmData } from "@/lib/getsongbpm";
import { fetchLastFmArtistGenres } from "@/lib/lastfm";
import { fetchTrackAudioAnalysis as fetchMusicBrainzAnalysis } from "@/lib/musicbrainz";
import { fetchReccoBeatsBySpotifyIds } from "@/lib/reccobeats";
import { fetchSoundNetAnalysis } from "@/lib/soundnet";
import {
  getCachedTrackAnalysis,
  getCachedTracksAnalysis,
  hasResolvedBpmKeyCache,
  saveCachedTrackAnalysis,
  upsertTrackCacheMetadata,
} from "@/lib/tracks-cache";

export interface AudioAnalysis {
  bpm: number | null;
  musicalKey: string | null;
  camelot: CamelotKey | null;
  source: "reccobeats" | "getsongbpm" | "soundnet" | "musicbrainz" | null;
  popularity: number | null;
  genres: string[];
}

const EMPTY_ANALYSIS: AudioAnalysis = {
  bpm: null,
  musicalKey: null,
  camelot: null,
  source: null,
  popularity: null,
  genres: [],
};

export interface TrackAudioInput {
  artist: string;
  title: string;
  duration_ms?: number;
  spotify_id?: string;
  artwork_url?: string | null;
}

function hasAnalysisData(analysis: {
  bpm: number | null;
  musicalKey: string | null;
  camelot: CamelotKey | null;
}): boolean {
  return analysis.bpm != null || analysis.camelot != null || analysis.musicalKey != null;
}

function withReccoPopularity(
  analysis: AudioAnalysis,
  popularity: number | null | undefined
): AudioAnalysis {
  if (analysis.popularity != null || popularity == null) return analysis;
  return { ...analysis, popularity };
}

function mergeReccoMetadata(
  analysis: AudioAnalysis,
  recco?: { popularity: number | null; genres: string[] }
): AudioAnalysis {
  if (!recco) return analysis;
  return {
    ...analysis,
    popularity: analysis.popularity ?? recco.popularity,
    genres: mergeGenreLists(analysis.genres, recco.genres),
  };
}

function mergeGenreLists(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const genre of list) {
      const key = genre.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(genre);
    }
  }
  return merged;
}

function mergeWithCachedPartial(
  fresh: AudioAnalysis,
  cached: AudioAnalysis | null | undefined
): AudioAnalysis {
  if (!cached) return fresh;
  return {
    ...fresh,
    popularity: fresh.popularity ?? cached.popularity,
    genres: mergeGenreLists(cached.genres, fresh.genres),
  };
}

async function enrichWithGetSongBpmGenres(
  track: TrackAudioInput,
  analysis: AudioAnalysis,
  prefetchedGenres?: string[]
): Promise<AudioAnalysis> {
  const genres = prefetchedGenres ?? (await fetchGetSongBpmData(track)).genres;
  if (genres.length === 0) return analysis;
  return { ...analysis, genres: mergeGenreLists(analysis.genres, genres) };
}

async function enrichWithLastFmGenres(
  track: TrackAudioInput,
  analysis: AudioAnalysis
): Promise<AudioAnalysis> {
  const genres = await fetchLastFmArtistGenres(track.artist);
  if (genres.length === 0) return analysis;
  return { ...analysis, genres: mergeGenreLists(analysis.genres, genres) };
}

/** Merge GetSongBPM genres, then Last.fm if still empty. */
async function finalizeAnalysis(
  track: TrackAudioInput,
  analysis: AudioAnalysis,
  options?: { prefetchedGetSongGenres?: string[] }
): Promise<AudioAnalysis> {
  let result =
    analysis.source === "getsongbpm"
      ? analysis
      : await enrichWithGetSongBpmGenres(
          track,
          analysis,
          options?.prefetchedGetSongGenres
        );

  if (result.genres.length === 0) {
    result = await enrichWithLastFmGenres(track, result);
  }

  return result;
}

async function fetchTrackAudioAnalysisFallback(
  track: TrackAudioInput,
  prefetchedGetsong?: GetSongBpmData
): Promise<AudioAnalysis> {
  const getsong = prefetchedGetsong?.analysis ?? (await fetchGetSongBpmAnalysis(track));
  if (hasAnalysisData(getsong)) return getsong;

  if (track.spotify_id) {
    const soundnet = await fetchSoundNetAnalysis(track.spotify_id);
    if (hasAnalysisData(soundnet)) return soundnet;
  }

  const mb = await fetchMusicBrainzAnalysis({
    artist: track.artist,
    title: track.title,
    duration_ms: track.duration_ms,
  });

  if (hasAnalysisData(mb)) {
    return {
      bpm: mb.bpm,
      musicalKey: mb.musicalKey,
      camelot: mb.camelot,
      source: "musicbrainz",
      popularity: null,
      genres: [],
    };
  }

  return EMPTY_ANALYSIS;
}

async function fetchTrackAudioAnalysisUncached(
  track: TrackAudioInput
): Promise<AudioAnalysis> {
  const getsongPromise = fetchGetSongBpmData(track);
  const reccoPromise = track.spotify_id
    ? fetchReccoBeatsBySpotifyIds([track.spotify_id])
    : Promise.resolve(new Map());

  const [reccoMap, getsongData] = await Promise.all([reccoPromise, getsongPromise]);
  const recco = track.spotify_id ? reccoMap.get(track.spotify_id) : undefined;

  if (recco?.analysis && hasAnalysisData(recco.analysis)) {
    return finalizeAnalysis(
      track,
      mergeReccoMetadata(withReccoPopularity(recco.analysis, recco.popularity), recco),
      { prefetchedGetSongGenres: getsongData.genres }
    );
  }

  if (recco && (recco.popularity != null || recco.genres.length > 0)) {
    const fallback = await fetchTrackAudioAnalysisFallback(track, getsongData);
    return finalizeAnalysis(track, mergeReccoMetadata(fallback, recco), {
      prefetchedGetSongGenres: getsongData.genres,
    });
  }

  return finalizeAnalysis(track, await fetchTrackAudioAnalysisFallback(track, getsongData));
}

export async function fetchTrackAudioAnalysis(track: TrackAudioInput): Promise<AudioAnalysis> {
  let partialCache: AudioAnalysis | null = null;

  if (track.spotify_id) {
    const cached = await getCachedTrackAnalysis(track.spotify_id);
    if (cached) {
      if (hasResolvedBpmKeyCache(cached)) {
        if (track.artwork_url?.trim()) {
          void upsertTrackCacheMetadata(track);
        }
        return cached;
      }
      partialCache = cached;
    }
  }

  const result = mergeWithCachedPartial(
    await fetchTrackAudioAnalysisUncached(track),
    partialCache
  );
  await saveCachedTrackAnalysis(track, result);
  return result;
}

export async function fetchTracksAudioAnalysis(
  tracks: TrackAudioInput[]
): Promise<AudioAnalysis[]> {
  const spotifyIds = tracks
    .map((t) => t.spotify_id)
    .filter((id): id is string => Boolean(id));

  const cacheMap = await getCachedTracksAnalysis(spotifyIds);
  const results: AudioAnalysis[] = new Array(tracks.length);
  const uncached: {
    index: number;
    track: TrackAudioInput;
    partialCache: AudioAnalysis | null;
  }[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (track.spotify_id) {
      const cached = cacheMap.get(track.spotify_id);
      if (cached) {
        if (hasResolvedBpmKeyCache(cached)) {
          results[i] = cached;
          if (track.artwork_url?.trim()) {
            void upsertTrackCacheMetadata(track);
          }
          continue;
        }
        uncached.push({ index: i, track, partialCache: cached });
        continue;
      }
    }
    uncached.push({ index: i, track, partialCache: null });
  }

  if (uncached.length === 0) return results;

  const uncachedIds = uncached
    .map(({ track }) => track.spotify_id)
    .filter((id): id is string => Boolean(id));

  const [reccoMap, getsongDataList] = await Promise.all([
    fetchReccoBeatsBySpotifyIds(uncachedIds),
    Promise.all(uncached.map(({ track }) => fetchGetSongBpmData(track))),
  ]);

  await Promise.all(
    uncached.map(async ({ index, track, partialCache }, uncachedIndex) => {
      let result: AudioAnalysis;
      const getsongData = getsongDataList[uncachedIndex];

      if (!track.spotify_id) {
        const fallback = await fetchTrackAudioAnalysisFallback(track, getsongData);
        result = await finalizeAnalysis(track, fallback, {
          prefetchedGetSongGenres: getsongData.genres,
        });
      } else {
        const recco = reccoMap.get(track.spotify_id);
        if (recco?.analysis && hasAnalysisData(recco.analysis)) {
          result = await finalizeAnalysis(
            track,
            mergeReccoMetadata(withReccoPopularity(recco.analysis, recco.popularity), recco),
            { prefetchedGetSongGenres: getsongData.genres }
          );
        } else {
          const fallback = await fetchTrackAudioAnalysisFallback(track, getsongData);
          result = await finalizeAnalysis(track, mergeReccoMetadata(fallback, recco), {
            prefetchedGetSongGenres: getsongData.genres,
          });
        }
        result = mergeWithCachedPartial(result, partialCache);
        await saveCachedTrackAnalysis(track, result);
      }

      results[index] = result;
    })
  );

  return results;
}
