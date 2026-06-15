import type { CamelotKey } from "@/lib/camelot";
import { fetchGetSongBpmAnalysis } from "@/lib/getsongbpm";
import { fetchTrackAudioAnalysis as fetchMusicBrainzAnalysis } from "@/lib/musicbrainz";
import { fetchReccoBeatsBySpotifyIds } from "@/lib/reccobeats";
import { fetchSoundNetAnalysis } from "@/lib/soundnet";

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
    genres: analysis.genres.length > 0 ? analysis.genres : recco.genres,
  };
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

export async function fetchTrackAudioAnalysis(track: TrackAudioInput): Promise<AudioAnalysis> {
  if (track.spotify_id) {
    const reccoMap = await fetchReccoBeatsBySpotifyIds([track.spotify_id]);
    const recco = reccoMap.get(track.spotify_id);
    if (recco?.analysis && hasAnalysisData(recco.analysis)) {
      return mergeReccoMetadata(withReccoPopularity(recco.analysis, recco.popularity), recco);
    }
    if (recco && (recco.popularity != null || recco.genres.length > 0)) {
      return mergeReccoMetadata(EMPTY_ANALYSIS, recco);
    }
  }

  return fetchTrackAudioAnalysisFallback(track);
}

export async function fetchTracksAudioAnalysis(
  tracks: TrackAudioInput[]
): Promise<AudioAnalysis[]> {
  const reccoMap = await fetchReccoBeatsBySpotifyIds(
    tracks.map((t) => t.spotify_id).filter((id): id is string => Boolean(id))
  );

  const results: AudioAnalysis[] = [];
  for (const track of tracks) {
    const recco = track.spotify_id ? reccoMap.get(track.spotify_id) : undefined;
    if (recco?.analysis && hasAnalysisData(recco.analysis)) {
      results.push(mergeReccoMetadata(withReccoPopularity(recco.analysis, recco.popularity), recco));
      continue;
    }

    const fallback = await fetchTrackAudioAnalysisFallback(track);
    results.push(mergeReccoMetadata(fallback, recco));
  }
  return results;
}
