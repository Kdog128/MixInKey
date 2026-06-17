import { CamelotKey, parseMusicalKeyString } from "@/lib/camelot";

const ACOUSTICBRAINZ_BASE = (
  process.env.ACOUSTICBRAINZ_API_URL ?? "https://acousticbrainz.org/api/v1"
).replace(/\/$/, "");

const ACOUSTICBRAINZ_TIMEOUT_MS = 3000;

export interface AcousticBrainzAnalysis {
  bpm: number | null;
  musicalKey: string | null;
  camelot: CamelotKey | null;
}

const EMPTY_ANALYSIS: AcousticBrainzAnalysis = {
  bpm: null,
  musicalKey: null,
  camelot: null,
};

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

function parseAcousticBrainzPayload(
  data: Record<string, unknown>
): AcousticBrainzAnalysis {
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

export async function fetchAcousticBrainzAnalysis(
  mbid: string
): Promise<AcousticBrainzAnalysis> {
  const url = `${ACOUSTICBRAINZ_BASE}/${mbid}/low-level`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(ACOUSTICBRAINZ_TIMEOUT_MS),
    });

    if (res.status === 404) {
      console.log("[acousticbrainz] No low-level data for mbid:", mbid);
      return EMPTY_ANALYSIS;
    }

    if (!res.ok) {
      console.warn("[acousticbrainz] Fetch failed:", { mbid, status: res.status });
      return EMPTY_ANALYSIS;
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
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    console.warn("[acousticbrainz] Fetch error:", {
      mbid,
      timedOut,
      message: err instanceof Error ? err.message : String(err),
    });
    return EMPTY_ANALYSIS;
  }
}
