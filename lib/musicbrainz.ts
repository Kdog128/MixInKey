import { CamelotKey, parseMusicalKeyString } from "@/lib/camelot";

const MUSICBRAINZ_BASE = "https://musicbrainz.org/ws/2";
const ACOUSTICBRAINZ_BASE =
  (process.env.ACOUSTICBRAINZ_API_URL ?? "https://acousticbrainz.org/api/v1").replace(/\/$/, "");

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

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
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
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (value && typeof value === "object" && "mean" in value) {
    const mean = (value as { mean?: unknown }).mean;
    if (typeof mean === "number" && Number.isFinite(mean) && mean > 0) return mean;
  }
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function parseAcousticBrainzPayload(data: Record<string, unknown>): Omit<MusicBrainzAnalysis, "mbid"> {
  const rhythm = data.rhythm as Record<string, unknown> | undefined;
  const tonal = data.tonal as Record<string, unknown> | undefined;

  const bpm = readNumber(rhythm?.bpm);

  const keyCandidates = [
    tonal?.key_edma as Record<string, unknown> | undefined,
    tonal?.key_krumhansl as Record<string, unknown> | undefined,
    tonal?.key_temperley as Record<string, unknown> | undefined,
  ];

  let musicalKey: string | null = null;
  for (const candidate of keyCandidates) {
    const key = readString(candidate?.key);
    const scale = readString(candidate?.scale);
    if (key && scale) {
      musicalKey = `${key} ${scale}`;
      break;
    }
  }

  if (!musicalKey) {
    const chordsKey = readString(tonal?.chords_key);
    const chordsScale = readString(tonal?.chords_scale);
    if (chordsKey && chordsScale) {
      musicalKey = `${chordsKey} ${chordsScale}`;
    }
  }

  const camelot = musicalKey ? parseMusicalKeyString(musicalKey) : null;

  return { bpm: bpm != null ? Math.round(bpm) : null, musicalKey, camelot };
}

async function fetchAcousticBrainzAnalysis(mbid: string): Promise<Omit<MusicBrainzAnalysis, "mbid">> {
  const url = `${ACOUSTICBRAINZ_BASE}/${mbid}/low-level`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (res.status === 404) {
    console.log("[acousticbrainz] No low-level data for mbid:", mbid);
    return { bpm: null, musicalKey: null, camelot: null };
  }

  if (!res.ok) {
    console.warn("[acousticbrainz] Fetch failed:", { mbid, status: res.status });
    return { bpm: null, musicalKey: null, camelot: null };
  }

  const data = (await res.json()) as Record<string, unknown>;
  const analysis = parseAcousticBrainzPayload(data);

  console.log("[acousticbrainz] Parsed analysis:", {
    mbid,
    bpm: analysis.bpm,
    key: analysis.musicalKey,
    camelot: analysis.camelot?.label ?? null,
  });

  return analysis;
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
    const mbids = await searchRecordingMbids(track.artist, track.title, track.duration_ms);
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
