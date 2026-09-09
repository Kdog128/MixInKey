import { CamelotKey } from "@/lib/camelot";
import { fetchAcousticBrainzAnalysis } from "@/lib/acousticbrainz";

const MUSICBRAINZ_BASE = "https://musicbrainz.org/ws/2";
// Last-resort under the 6s features budget. After a ~3s Recco/GetSongBPM/SoundNet
// race, two cache-miss tracks still share MusicBrainz's 1.1s rate-limit gap.
// 800ms per HTTP call + a single recording candidate keeps search + AcousticBrainz
// inside the remaining window.
const MUSICBRAINZ_TIMEOUT_MS = 800;

const USER_AGENT =
  process.env.MUSICBRAINZ_USER_AGENT ??
  "DJTrackCompatibility/1.0.0 (https://github.com/dj-companion-app)";

export interface MusicBrainzAnalysis {
  bpm: number | null;
  musicalKey: string | null;
  camelot: CamelotKey | null;
  mbid: string | null;
}

const EMPTY_ANALYSIS: MusicBrainzAnalysis = {
  bpm: null,
  musicalKey: null,
  camelot: null,
  mbid: null,
};

let lastMusicBrainzRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleMusicBrainz(): Promise<void> {
  const elapsed = Date.now() - lastMusicBrainzRequestAt;
  if (elapsed < 1100) await sleep(1100 - elapsed);
  lastMusicBrainzRequestAt = Date.now();
}

function escapeLucene(value: string): string {
  return value.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&");
}

function primaryArtist(artist: string): string {
  return artist.split(/\s feat\.|\s ft\.|,|\s & /i)[0].trim();
}

function normalizeTitle(title: string): string {
  return title
    .replace(/\s*[\(\[]?(feat\.|ft\.|with)[^\)\]]*[\)\]]?/gi, "")
    .replace(/\s*-\s*(remix|edit|mix|version|radio edit).*$/i, "")
    .trim();
}

interface MusicBrainzRecording {
  id: string;
  score: number;
  title: string;
  length?: number;
}

async function searchRecordingMbids(
  artist: string,
  title: string,
  durationMs?: number,
  limit = 5
): Promise<string[]> {
  const artistName = primaryArtist(artist);
  const recordingTitle = normalizeTitle(title);
  if (!artistName || !recordingTitle) return [];

  const query = `recording:"${escapeLucene(recordingTitle)}" AND artist:"${escapeLucene(artistName)}"`;
  const url = `${MUSICBRAINZ_BASE}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}`;

  await throttleMusicBrainz();

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(MUSICBRAINZ_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn("[musicbrainz] Recording search failed:", {
        status: res.status,
        artist: artistName,
        title: recordingTitle,
      });
      return [];
    }

    const data = (await res.json()) as { recordings?: MusicBrainzRecording[] };
    const recordings = data.recordings ?? [];
    if (recordings.length === 0) {
      console.log("[musicbrainz] No recording match:", { artist: artistName, title: recordingTitle });
      return [];
    }

    const sorted = [...recordings].sort((a, b) => {
      if (durationMs && a.length && b.length) {
        return Math.abs(a.length - durationMs) - Math.abs(b.length - durationMs);
      }
      return b.score - a.score;
    });

    const mbids = sorted.map((r) => r.id);
    console.log("[musicbrainz] Recording candidates:", mbids.length, "for", recordingTitle);
    return mbids;
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    console.warn("[musicbrainz] Recording search error:", {
      artist: artistName,
      title: recordingTitle,
      timedOut,
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export interface TrackAudioInput {
  artist: string;
  title: string;
  duration_ms?: number;
}

export async function fetchTrackAudioAnalysis(track: TrackAudioInput): Promise<MusicBrainzAnalysis> {
  if (!track.artist.trim() || !track.title.trim()) {
    return EMPTY_ANALYSIS;
  }

  try {
    const mbids = await searchRecordingMbids(track.artist, track.title, track.duration_ms, 1);
    if (mbids.length === 0) return EMPTY_ANALYSIS;

    for (const mbid of mbids) {
      const analysis = await fetchAcousticBrainzAnalysis(mbid);
      if (analysis.bpm != null || analysis.musicalKey != null) {
        return { ...analysis, mbid };
      }
    }

    console.log("[acousticbrainz] No BPM/key data for any candidate mbid");
    return { ...EMPTY_ANALYSIS, mbid: mbids[0] };
  } catch (err) {
    console.error("[musicbrainz] Analysis error:", err);
    return EMPTY_ANALYSIS;
  }
}

export async function fetchTracksAudioAnalysis(
  tracks: TrackAudioInput[]
): Promise<MusicBrainzAnalysis[]> {
  const results: MusicBrainzAnalysis[] = [];
  for (const track of tracks) {
    results.push(await fetchTrackAudioAnalysis(track));
  }
  return results;
}
