/**
 * SoundNet Track Analysis via RapidAPI
 * GET https://track-analysis.p.rapidapi.com/pktx/spotify/{spotifyTrackID}
 */
import { getCamelotKey, parseMusicalKeyString, type CamelotKey } from "@/lib/camelot";
import type { AudioAnalysis } from "@/lib/audio-analysis";

const API_HOST = "track-analysis.p.rapidapi.com";
const API_BASE = `https://${API_HOST}/pktx/spotify`;

const EMPTY: AudioAnalysis = {
  bpm: null,
  musicalKey: null,
  camelot: null,
  source: null,
};

interface SoundNetResponse {
  key?: string | number;
  mode?: string | number;
  camelot?: string;
  tempo?: number;
}

function getApiKey(): string | null {
  const key = process.env.RAPIDAPI_KEY?.trim();
  return key || null;
}

function parseMode(mode: string | number | undefined): number | null {
  if (mode === 0 || mode === 1) return mode;
  if (typeof mode === "string") {
    const lower = mode.toLowerCase();
    if (lower === "minor" || lower === "min") return 0;
    if (lower === "major" || lower === "maj") return 1;
  }
  return null;
}

function camelotFromKeyMode(key: string | number | undefined, mode: string | number | undefined): CamelotKey | null {
  const parsedMode = parseMode(mode);
  if (parsedMode == null || key == null) return null;

  if (typeof key === "number" && key >= 0 && key <= 11) {
    return getCamelotKey(key, parsedMode);
  }

  if (typeof key === "string" && key.trim()) {
    const modeLabel = parsedMode === 1 ? "major" : "minor";
    return parseMusicalKeyString(`${key.trim()} ${modeLabel}`);
  }

  return null;
}

function responseToAnalysis(data: SoundNetResponse): AudioAnalysis {
  const camelot: CamelotKey | null =
    (data.camelot ? parseMusicalKeyString(data.camelot) : null) ??
    camelotFromKeyMode(data.key, data.mode);

  const bpm =
    data.tempo != null && Number.isFinite(data.tempo) && data.tempo > 0
      ? Math.round(data.tempo)
      : null;

  return {
    bpm,
    musicalKey: camelot?.musicalKey ?? null,
    camelot,
    source: "soundnet",
  };
}

export async function fetchSoundNetAnalysis(spotifyId: string): Promise<AudioAnalysis> {
  const apiKey = getApiKey();
  const id = spotifyId.trim();

  if (!apiKey) {
    console.warn("[soundnet] RAPIDAPI_KEY is not set");
    return EMPTY;
  }
  if (!id) return EMPTY;

  const url = `${API_BASE}/${encodeURIComponent(id)}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": API_HOST,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn("[soundnet] Request failed:", { spotifyId: id, status: res.status });
      return EMPTY;
    }

    const data = (await res.json()) as SoundNetResponse;
    const analysis = responseToAnalysis(data);

    if (analysis.bpm == null && analysis.musicalKey == null) {
      console.log("[soundnet] No BPM/key in response:", { spotifyId: id });
      return EMPTY;
    }

    console.log("[soundnet] Match:", {
      spotifyId: id,
      bpm: analysis.bpm,
      key: analysis.musicalKey,
      camelot: analysis.camelot?.label,
    });
    return analysis;
  } catch (err) {
    console.error("[soundnet] Request error:", err);
    return EMPTY;
  }
}
