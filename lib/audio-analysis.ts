import type { CamelotKey } from "@/lib/camelot";
import { fetchGetSongBpmAnalysis, fetchGetSongBpmGenres } from "@/lib/getsongbpm";
import { fetchLastFmArtistGenres } from "@/lib/lastfm";
import { fetchTrackAudioAnalysis as fetchMusicBrainzAnalysis } from "@/lib/musicbrainz";
import { fetchReccoBeatsBySpotifyIds } from "@/lib/reccobeats";
import { fetchSoundNetAnalysis } from "@/lib/soundnet";
import {
  getCachedTrackAnalysis,
  getCachedTracksAnalysis,
  saveCachedTrackAnalysis,
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

async function enrichWithGetSongBpmGenres(
  track: TrackAudioInput,
  analysis: AudioAnalysis
): Promise<AudioAnalysis> {
  const genres = await fetchGetSongBpmGenres(track);
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
  analysis: AudioAnalysis
): Promise<AudioAnalysis> {
  let result =
    analysis.source === "getsongbpm"
      ? analysis
      : await enrichWithGetSongBpmGenres(track, analysis);

  if (result.genres.length === 0) {
    result = await enrichWithLastFmGenres(track, result);
  }

  return result;
}

async function fetchTrackAudioAnalysisFallback(track: TrackAudioInput): Promise<AudioAnalysis> {
  const getsong = await fetchGetSongBpmAnalysis(track);
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
  if (track.spotify_id) {
    const reccoMap = await fetchReccoBeatsBySpotifyIds([track.spotify_id]);
    const recco = reccoMap.get(track.spotify_id);
    if (recco?.analysis && hasAnalysisData(recco.analysis)) {
      return finalizeAnalysis(
        track,
        mergeReccoMetadata(withReccoPopularity(recco.analysis, recco.popularity), recco)
      );
    }
    if (recco && (recco.popularity != null || recco.genres.length > 0)) {
      return finalizeAnalysis(track, mergeReccoMetadata(EMPTY_ANALYSIS, recco));
    }
  }

  return finalizeAnalysis(track, await fetchTrackAudioAnalysisFallback(track));
}

export async function fetchTrackAudioAnalysis(track: TrackAudioInput): Promise<AudioAnalysis> {
  if (track.spotify_id) {
    const cached = await getCachedTrackAnalysis(track.spotify_id);
    if (cached) return cached;
  }

  const result = await fetchTrackAudioAnalysisUncached(track);
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
  const uncached: { index: number; track: TrackAudioInput }[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (track.spotify_id) {
      const cached = cacheMap.get(track.spotify_id);
      if (cached) {
        results[i] = cached;
        continue;
      }
    }
    uncached.push({ index: i, track });
  }

  if (uncached.length === 0) return results;

  const reccoMap = await fetchReccoBeatsBySpotifyIds(
    uncached
      .map(({ track }) => track.spotify_id)
      .filter((id): id is string => Boolean(id))
  );

  await Promise.all(
    uncached.map(async ({ index, track }) => {
      let result: AudioAnalysis;

      if (!track.spotify_id) {
        result = await fetchTrackAudioAnalysisUncached(track);
      } else {
        const recco = reccoMap.get(track.spotify_id);
        if (recco?.analysis && hasAnalysisData(recco.analysis)) {
          result = await finalizeAnalysis(
            track,
            mergeReccoMetadata(withReccoPopularity(recco.analysis, recco.popularity), recco)
          );
        } else {
          const fallback = await fetchTrackAudioAnalysisFallback(track);
          result = await finalizeAnalysis(track, mergeReccoMetadata(fallback, recco));
        }
        await saveCachedTrackAnalysis(track, result);
      }

      results[index] = result;
    })
  );

  return results;
}
