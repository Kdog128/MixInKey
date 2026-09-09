import type { CamelotKey } from "@/lib/camelot";
import { fetchGetSongBpmData, type GetSongBpmData } from "@/lib/getsongbpm";
import { fetchLastFmArtistGenres } from "@/lib/lastfm";
import { fetchTrackAudioAnalysis as fetchMusicBrainzAnalysis } from "@/lib/musicbrainz";
import { fetchReccoBeatsBySpotifyIds, type ReccoBeatsTrackData } from "@/lib/reccobeats";
import { fetchSoundNetAnalysis } from "@/lib/soundnet";
import {
  getCachedTrackAnalysis,
  getCachedTracksAnalysis,
  isEssentiaResolved,
  isFreshNegativeCache,
  saveCachedTrackAnalysis,
  upsertTrackCacheMetadata,
  type CachedAudioAnalysis,
} from "@/lib/tracks-cache";

export type AudioAnalysisSource =
  | "reccobeats"
  | "getsongbpm"
  | "soundnet"
  | "musicbrainz"
  | "essentia"
  | null;

export interface AudioAnalysis {
  bpm: number | null;
  musicalKey: string | null;
  camelot: CamelotKey | null;
  source: AudioAnalysisSource;
  popularity: number | null;
  genres: string[];
  essentiaAttemptedAt?: string | null;
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
  isrc?: string | null;
  release_date?: string | null;
}

interface GenreFollowUp {
  getsongCombinedP: Promise<GetSongBpmData>;
  reccoP: Promise<ReccoBeatsTrackData | undefined>;
}

interface UncachedResolution {
  analysis: AudioAnalysis;
  genreFollowUp: GenreFollowUp;
}

function hasAnalysisData(analysis: {
  bpm: number | null;
  musicalKey: string | null;
  camelot: CamelotKey | null;
}): boolean {
  return analysis.bpm != null || analysis.camelot != null || analysis.musicalKey != null;
}

function hasUsableBpmAndKey(analysis: {
  bpm: number | null;
  musicalKey: string | null;
}): boolean {
  return analysis.bpm != null && analysis.musicalKey != null;
}

function firstUsableBpmKey(
  providers: Array<Promise<AudioAnalysis | null | undefined>>
): Promise<AudioAnalysis | null> {
  return new Promise((resolve) => {
    let pending = providers.length;
    if (pending === 0) {
      resolve(null);
      return;
    }
    let settled = false;
    for (const provider of providers) {
      void provider.then(
        (analysis) => {
          if (settled) return;
          if (analysis && hasUsableBpmAndKey(analysis)) {
            settled = true;
            resolve(analysis);
            return;
          }
          pending -= 1;
          if (pending === 0) resolve(null);
        },
        () => {
          if (settled) return;
          pending -= 1;
          if (pending === 0) resolve(null);
        }
      );
    }
  });
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
    essentiaAttemptedAt: fresh.essentiaAttemptedAt ?? cached.essentiaAttemptedAt,
  };
}

function cacheGateBranch(cached: CachedAudioAnalysis): "positive" | "negative" | "revalidate" {
  if (hasUsableBpmAndKey(cached)) return "positive";
  if (isFreshNegativeCache(cached)) return "negative";
  return "revalidate";
}

function logCacheGate(spotifyId: string, cached: CachedAudioAnalysis): "positive" | "negative" | "revalidate" {
  const branch = cacheGateBranch(cached);
  console.log("[audio-analysis] Cache gate:", {
    spotify_id: spotifyId,
    bpm: cached.bpm,
    musical_key: cached.musicalKey,
    lookup_attempted_at: cached.lookupAttemptedAt,
    essentia_attempted_at: cached.essentiaAttemptedAt,
    branch,
  });
  return branch;
}

function reccoToUsableAnalysis(recco?: ReccoBeatsTrackData): AudioAnalysis | null {
  if (!recco?.analysis || !hasUsableBpmAndKey(recco.analysis)) return null;
  return mergeReccoMetadata(withReccoPopularity(recco.analysis, recco.popularity), recco);
}

function genresUnchanged(before: string[], after: string[]): boolean {
  return after.length === before.length;
}

function scheduleGenreCacheUpdate(
  track: TrackAudioInput,
  analysis: AudioAnalysis,
  followUp: GenreFollowUp
): void {
  if (!track.spotify_id) return;

  void (async () => {
    try {
      let genres = analysis.genres;
      const [getsong, recco] = await Promise.all([
        followUp.getsongCombinedP.catch(() => ({
          analysis: EMPTY_ANALYSIS,
          genres: [] as string[],
          matched: false,
        })),
        followUp.reccoP.catch(() => undefined),
      ]);
      genres = mergeGenreLists(genres, getsong.genres, recco?.genres ?? []);

      if (genres.length === 0) {
        genres = mergeGenreLists(genres, await fetchLastFmArtistGenres(track.artist));
      }

      if (genresUnchanged(analysis.genres, genres)) return;
      await saveCachedTrackAnalysis(track, { ...analysis, genres });
    } catch (err) {
      console.warn("[audio-analysis] Background genre enrichment failed:", err);
    }
  })();
}

async function persistAnalysis(
  track: TrackAudioInput,
  analysis: AudioAnalysis,
  followUp: GenreFollowUp
): Promise<void> {
  if (!track.spotify_id) return;

  const latest = await getCachedTrackAnalysis(track.spotify_id);
  const latestUsable = latest != null && hasUsableBpmAndKey(latest);
  const essentiaWon =
    isEssentiaResolved(track.spotify_id) || latest?.source === "essentia";

  if (essentiaWon && latestUsable) {
    console.log("[audio-analysis] Discarding leftover provider persist; Essentia already resolved:", {
      spotifyId: track.spotify_id,
      bpm: latest.bpm,
      key: latest.musicalKey,
    });
    if (analysis.genres.length > 0) {
      await saveCachedTrackAnalysis(track, {
        ...latest,
        genres: mergeGenreLists(latest.genres, analysis.genres),
      });
    }
    scheduleGenreCacheUpdate(track, latest, followUp);
    return;
  }

  if (!hasUsableBpmAndKey(analysis) && latestUsable) {
    console.log("[audio-analysis] Discarding provider miss; bpm/key already cached:", {
      spotifyId: track.spotify_id,
      bpm: latest.bpm,
      key: latest.musicalKey,
    });
    if (analysis.genres.length > 0) {
      await saveCachedTrackAnalysis(track, {
        ...latest,
        genres: mergeGenreLists(latest.genres, analysis.genres),
      });
    }
    scheduleGenreCacheUpdate(track, latest, followUp);
    return;
  }

  await saveCachedTrackAnalysis(track, analysis, { completedLookup: true });
  scheduleGenreCacheUpdate(track, analysis, followUp);
}

async function resolveUncachedTrackAnalysis(
  track: TrackAudioInput,
  reccoPromise: Promise<Map<string, ReccoBeatsTrackData>>
): Promise<UncachedResolution> {
  const reccoP = track.spotify_id
    ? reccoPromise.then((map) => map.get(track.spotify_id))
    : Promise.resolve(undefined);
  const getsongCombinedP = fetchGetSongBpmData(track, { lookup: "combined" });
  const soundnetP = track.spotify_id
    ? fetchSoundNetAnalysis(track.spotify_id)
    : Promise.resolve(EMPTY_ANALYSIS);
  const genreFollowUp = { getsongCombinedP, reccoP };

  const discardedByEssentia = async (): Promise<UncachedResolution | null> => {
    if (!track.spotify_id || !isEssentiaResolved(track.spotify_id)) return null;
    const recco = await reccoP.catch(() => undefined);
    console.log("[audio-analysis] Aborting leftover provider lookup; Essentia already resolved:", {
      spotifyId: track.spotify_id,
    });
    return { analysis: mergeReccoMetadata(EMPTY_ANALYSIS, recco), genreFollowUp };
  };

  const winner = await firstUsableBpmKey([
    reccoP.then((recco) => reccoToUsableAnalysis(recco)),
    getsongCombinedP.then((data) =>
      hasUsableBpmAndKey(data.analysis) ? data.analysis : null
    ),
    soundnetP.then((analysis) => (hasUsableBpmAndKey(analysis) ? analysis : null)),
  ]);
  const abortedAfterFast = await discardedByEssentia();
  if (abortedAfterFast) return abortedAfterFast;
  if (winner) return { analysis: winner, genreFollowUp };

  const [recco, getsongCombined, soundnet] = await Promise.all([
    reccoP,
    getsongCombinedP,
    soundnetP,
  ]);

  const otherMatched =
    hasAnalysisData(recco?.analysis ?? EMPTY_ANALYSIS) || hasAnalysisData(soundnet);

  const abortedAfterRecco = await discardedByEssentia();
  if (abortedAfterRecco) return abortedAfterRecco;

  if (!getsongCombined.matched && !otherMatched) {
    const titleOnly = await fetchGetSongBpmData(track, { lookup: "title" });
    const abortedTitle = await discardedByEssentia();
    if (abortedTitle) return abortedTitle;
    if (hasUsableBpmAndKey(titleOnly.analysis) || hasAnalysisData(titleOnly.analysis)) {
      return {
        analysis: mergeReccoMetadata(titleOnly.analysis, recco),
        genreFollowUp,
      };
    }
  }

  const abortedBeforeMb = await discardedByEssentia();
  if (abortedBeforeMb) return abortedBeforeMb;

  const mb = await fetchMusicBrainzAnalysis({
    artist: track.artist,
    title: track.title,
    duration_ms: track.duration_ms,
  });
  const mbAnalysis: AudioAnalysis = {
    bpm: mb.bpm,
    musicalKey: mb.musicalKey,
    camelot: mb.camelot,
    source: hasAnalysisData({
      bpm: mb.bpm,
      musicalKey: mb.musicalKey,
      camelot: mb.camelot,
    })
      ? "musicbrainz"
      : null,
    popularity: null,
    genres: [],
  };
  if (hasAnalysisData(mbAnalysis)) {
    const abortedAfterMb = await discardedByEssentia();
    if (abortedAfterMb) return abortedAfterMb;
    return { analysis: mergeReccoMetadata(mbAnalysis, recco), genreFollowUp };
  }
  if (hasAnalysisData(getsongCombined.analysis)) {
    return {
      analysis: mergeReccoMetadata(getsongCombined.analysis, recco),
      genreFollowUp,
    };
  }
  if (hasAnalysisData(soundnet)) {
    return { analysis: mergeReccoMetadata(soundnet, recco), genreFollowUp };
  }

  return { analysis: mergeReccoMetadata(EMPTY_ANALYSIS, recco), genreFollowUp };
}

export async function fetchTrackAudioAnalysis(track: TrackAudioInput): Promise<AudioAnalysis> {
  let partialCache: AudioAnalysis | null = null;

  if (track.spotify_id) {
    const cached = await getCachedTrackAnalysis(track.spotify_id);
    if (cached) {
      const branch = logCacheGate(track.spotify_id, cached);
      if (branch === "positive" || branch === "negative") {
        if (track.artwork_url?.trim()) {
          void upsertTrackCacheMetadata(track);
        }
        return cached;
      }
      partialCache = cached;
    }
  }

  const reccoPromise = track.spotify_id
    ? fetchReccoBeatsBySpotifyIds([track.spotify_id])
    : Promise.resolve(new Map<string, ReccoBeatsTrackData>());
  const { analysis, genreFollowUp } = await resolveUncachedTrackAnalysis(track, reccoPromise);
  const result = mergeWithCachedPartial(analysis, partialCache);
  await persistAnalysis(track, result, genreFollowUp);
  if (track.spotify_id) {
    const latest = await getCachedTrackAnalysis(track.spotify_id);
    if (latest && hasUsableBpmAndKey(latest)) return latest;
  }
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
        const branch = logCacheGate(track.spotify_id, cached);
        if (branch === "positive" || branch === "negative") {
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
  const reccoPromise = fetchReccoBeatsBySpotifyIds(uncachedIds);

  await Promise.all(
    uncached.map(async ({ index, track, partialCache }) => {
      if (track.spotify_id) {
        const latest = await getCachedTrackAnalysis(track.spotify_id);
        if (latest && hasUsableBpmAndKey(latest)) {
          results[index] = latest;
          if (track.artwork_url?.trim()) {
            void upsertTrackCacheMetadata(track);
          }
          return;
        }
      }

      const { analysis, genreFollowUp } = await resolveUncachedTrackAnalysis(
        track,
        reccoPromise
      );
      const result = mergeWithCachedPartial(analysis, partialCache);
      await persistAnalysis(track, result, genreFollowUp);

      if (track.spotify_id && isEssentiaResolved(track.spotify_id)) {
        const latest = await getCachedTrackAnalysis(track.spotify_id);
        if (latest && hasUsableBpmAndKey(latest)) {
          results[index] = latest;
          return;
        }
      }

      results[index] = result;
    })
  );

  return results;
}
