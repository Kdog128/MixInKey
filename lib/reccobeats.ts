/**
 * ReccoBeats audio features API — no API key required.
 * GET https://api.reccobeats.com/v1/audio-features?ids={spotifyId1},{spotifyId2}
 */
import { getCamelotKey, type CamelotKey } from "@/lib/camelot";
import type { AudioAnalysis } from "@/lib/audio-analysis";

const API_URL = "https://api.reccobeats.com/v1/audio-features";

interface ReccoBeatsFeature {
  id?: string;
  href?: string;
  tempo?: number;
  key?: number;
  mode?: number;
}

function spotifyIdFromHref(href: string): string | null {
  const match = href.match(/track\/([a-zA-Z0-9]+)/);
  return match?.[1] ?? null;
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
  };
}

export async function fetchReccoBeatsBySpotifyIds(
  spotifyIds: string[]
): Promise<Map<string, AudioAnalysis>> {
  const result = new Map<string, AudioAnalysis>();
  const uniqueIds = [...new Set(spotifyIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return result;

  const url = `${API_URL}?ids=${uniqueIds.map(encodeURIComponent).join(",")}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn("[reccobeats] Request failed:", { status: res.status, count: uniqueIds.length });
      return result;
    }

    const data = (await res.json()) as { content?: ReccoBeatsFeature[] };
    for (const feature of data.content ?? []) {
      const spotifyId = feature.href ? spotifyIdFromHref(feature.href) : null;
      if (!spotifyId) continue;

      const analysis = featureToAnalysis(feature);
      if (analysis.bpm != null || analysis.camelot != null) {
        result.set(spotifyId, analysis);
        console.log("[reccobeats] Match:", {
          spotifyId,
          bpm: analysis.bpm,
          key: analysis.musicalKey,
          camelot: analysis.camelot?.label,
        });
      }
    }

    if (result.size === 0) {
      console.log("[reccobeats] No features returned for ids:", uniqueIds);
    }
  } catch (err) {
    console.error("[reccobeats] Request error:", err);
  }

  return result;
}
