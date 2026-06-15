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
}

const EMPTY_ANALYSIS: AudioAnalysis = {
  bpm: null,
  musicalKey: null,
  camelot: null,
  source: null,
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
    };
  }

  return EMPTY_ANALYSIS;
}

export async function fetchTrackAudioAnalysis(track: TrackAudioInput): Promise<AudioAnalysis> {
  if (track.spotify_id) {
    const reccoMap = await fetchReccoBeatsBySpotifyIds([track.spotify_id]);
    const recco = reccoMap.get(track.spotify_id);
    if (recco && hasAnalysisData(recco)) return recco;
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
    if (recco && hasAnalysisData(recco)) {
      results.push(recco);
    } else {
      results.push(await fetchTrackAudioAnalysisFallback(track));
    }
  }
  return results;
}
