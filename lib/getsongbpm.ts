/**
 * GetSongBPM API — https://getsongbpm.com/api
 * Base URL: https://api.getsong.co/
 */
import { parseMusicalKeyString, type CamelotKey } from "@/lib/camelot";
import type { AudioAnalysis } from "@/lib/audio-analysis";

console.log("[getsongbpm] process.env.GETSONGBPM_API_KEY:", process.env.GETSONGBPM_API_KEY);

const API_BASE = "https://api.getsong.co";
const GETSONGBPM_TIMEOUT_MS = 3000;

const EMPTY: AudioAnalysis = {
  bpm: null,
  musicalKey: null,
  camelot: null,
  source: null,
  popularity: null,
  genres: [],
};

interface GetSongKeyObject {
  key_of?: string;
  mode?: string;
  raw?: string;
}

interface GetSongArtist {
  name?: string;
  genres?: string[];
}

interface GetSongSearchResult {
  id?: string;
  title?: string;
  bpm?: number | string;
  tempo?: number | string;
  key?: string | GetSongKeyObject;
  key_of?: string;
  artist?: GetSongArtist | GetSongArtist[];
}

function getApiKey(): string | null {
  const key = process.env.GETSONGBPM_API_KEY?.trim();
  return key || null;
}

function primaryArtist(artist: string): string {
  return artist.split(/\s feat\.|\s ft\.|,|\s & /i)[0].trim();
}

function normalizeTitle(title: string): string {
  return title
    .replace(/\s*[\(\[]?(feat\.|ft\.|with)[^\)\]]*[\)\]]?/gi, "")
    .trim();
}

function parseBpm(value: number | string | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function formatKeyField(key: string | GetSongKeyObject | undefined): string | null {
  if (key == null) return null;
  if (typeof key === "string") {
    const trimmed = key.trim();
    return trimmed || null;
  }
  if (key.raw?.trim()) return key.raw.trim();
  if (key.key_of?.trim()) {
    const mode = key.mode?.trim().toLowerCase();
    if (mode === "major" || mode === "minor") {
      return `${key.key_of} ${mode}`;
    }
    return key.key_of.trim();
  }
  return null;
}

function normalizeKeyOf(keyOf: string): string {
  return keyOf.replace(/\u266f/g, "#").replace(/\u266d/g, "b").trim();
}

function extractMusicalKey(result: GetSongSearchResult): string | null {
  const fromKey = formatKeyField(result.key);
  if (fromKey) return fromKey;

  const keyOf = result.key_of?.trim();
  if (!keyOf || keyOf === "m") return null;
  return normalizeKeyOf(keyOf);
}

function artistMatches(result: GetSongSearchResult, artist: string): boolean {
  const wantArtist = primaryArtist(artist).toLowerCase();
  return artistNames(result).some((name) => {
    const lower = name.toLowerCase();
    return lower === wantArtist || lower.includes(wantArtist) || wantArtist.includes(lower);
  });
}

function filterByArtist(items: GetSongSearchResult[], artist: string): GetSongSearchResult[] {
  return items.filter((item) => artistMatches(item, artist));
}

function artistNames(result: GetSongSearchResult): string[] {
  if (!result.artist) return [];
  if (Array.isArray(result.artist)) {
    return result.artist.map((a) => a.name ?? "").filter(Boolean);
  }
  return result.artist.name ? [result.artist.name] : [];
}

function titleSimilarity(a: string, b: string): number {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.85;

  const leftWords = new Set(left.split(/\s+/).filter(Boolean));
  const rightWords = new Set(right.split(/\s+/).filter(Boolean));
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  let shared = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) shared++;
  }
  return shared / Math.max(leftWords.size, rightWords.size);
}

function extractGenresFromResult(result: GetSongSearchResult): string[] {
  if (!result.artist) return [];
  const artists = Array.isArray(result.artist) ? result.artist : [result.artist];
  return [...new Set(artists.flatMap((artist) => artist.genres ?? []).filter(Boolean))];
}

function resultToAnalysis(result: GetSongSearchResult): AudioAnalysis {
  const musicalKey = extractMusicalKey(result);
  const camelot: CamelotKey | null = musicalKey ? parseMusicalKeyString(musicalKey) : null;

  return {
    bpm: parseBpm(result.bpm ?? result.tempo),
    musicalKey,
    camelot,
    source: "getsongbpm",
    popularity: null,
    genres: extractGenresFromResult(result),
  };
}

function pickBestMatch(
  items: GetSongSearchResult[],
  artist: string,
  title: string
): GetSongSearchResult | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];

  const wantTitle = normalizeTitle(title);

  let best: GetSongSearchResult | null = null;
  let bestScore = -1;

  for (const item of items) {
    const titleScore = item.title ? titleSimilarity(item.title, wantTitle) : 0;
    const artistMatch = artistMatches(item, artist);

    const score = titleScore * 0.7 + (artistMatch ? 0.3 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return best ?? items[0];
}

function extractSearchResults(data: unknown): GetSongSearchResult[] {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;

  if (Array.isArray(record.search)) return record.search as GetSongSearchResult[];
  if (Array.isArray(record.results)) return record.results as GetSongSearchResult[];
  if (record.song && typeof record.song === "object") return [record.song as GetSongSearchResult];
  if (Array.isArray(data)) return data as GetSongSearchResult[];
  return [];
}

export interface GetSongBpmTrackInput {
  artist: string;
  title: string;
}

async function searchGetSong(
  apiKey: string,
  lookup: string,
  type: "song" | "both"
): Promise<GetSongSearchResult[]> {
  const url = `${API_BASE}/search/?${new URLSearchParams({
    api_key: apiKey,
    type,
    lookup,
  }).toString()}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(GETSONGBPM_TIMEOUT_MS),
    });

    const bodyText = await res.text();
    console.log("[getsongbpm] Raw API response:", {
      status: res.status,
      type,
      lookup,
      body: bodyText,
    });
    if (!res.ok) {
      console.warn("[getsongbpm] Search failed:", { status: res.status, type, lookup });
      return [];
    }

    try {
      return extractSearchResults(JSON.parse(bodyText));
    } catch {
      console.warn("[getsongbpm] Invalid JSON response");
      return [];
    }
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      console.warn("[getsongbpm] Request timed out:", { type, lookup });
      return [];
    }
    console.error("[getsongbpm] Request error:", err);
    return [];
  }
}

export interface GetSongBpmData {
  analysis: AudioAnalysis;
  genres: string[];
  matched: boolean;
}

function unmatchedGetSongData(): GetSongBpmData {
  return { analysis: EMPTY, genres: [], matched: false };
}

function matchToGetSongData(match: GetSongSearchResult | null): GetSongBpmData {
  if (!match) return unmatchedGetSongData();
  const analysis = resultToAnalysis(match);
  return { analysis, genres: analysis.genres, matched: true };
}

function getLookupContext(
  track: GetSongBpmTrackInput
): { apiKey: string; artist: string; title: string } | null {
  const apiKey = getApiKey();
  const artist = primaryArtist(track.artist).trim();
  const title = normalizeTitle(track.title).trim();

  if (!apiKey) {
    console.warn("[getsongbpm] GETSONGBPM_API_KEY is not set");
    return null;
  }
  if (!artist || !title) return null;
  return { apiKey, artist, title };
}

export async function fetchGetSongBpmData(
  track: GetSongBpmTrackInput,
  options?: { lookup?: "auto" | "combined" | "title" }
): Promise<GetSongBpmData> {
  const ctx = getLookupContext(track);
  if (!ctx) return unmatchedGetSongData();

  const lookup = options?.lookup ?? "auto";

  try {
    if (lookup !== "title") {
      const combinedItems = await searchGetSong(
        ctx.apiKey,
        `song:${ctx.title} artist:${ctx.artist}`,
        "both"
      );
      if (combinedItems.length > 0) {
        return matchToGetSongData(pickBestMatch(combinedItems, ctx.artist, ctx.title));
      }
      if (lookup === "combined") return unmatchedGetSongData();
    }

    console.log("[getsongbpm] Combined lookup empty, using title-only results:", {
      artist: ctx.artist,
      title: ctx.title,
    });

    const titleResults = await searchGetSong(ctx.apiKey, ctx.title, "song");
    const items = filterByArtist(titleResults, ctx.artist);
    if (items.length === 0) {
      console.log("[getsongbpm] No results for:", { artist: ctx.artist, title: ctx.title });
      return unmatchedGetSongData();
    }
    return matchToGetSongData(pickBestMatch(items, ctx.artist, ctx.title));
  } catch (err) {
    console.error("[getsongbpm] Request error:", err);
    return unmatchedGetSongData();
  }
}

function hasGetSongAnalysisData(analysis: AudioAnalysis): boolean {
  return analysis.bpm != null || analysis.musicalKey != null;
}

export async function fetchGetSongBpmAnalysis(track: GetSongBpmTrackInput): Promise<AudioAnalysis> {
  const { analysis } = await fetchGetSongBpmData(track);
  if (!hasGetSongAnalysisData(analysis)) return EMPTY;

  console.log("[getsongbpm] Match:", {
    artist: track.artist,
    title: track.title,
    bpm: analysis.bpm,
    key: analysis.musicalKey,
    genres: analysis.genres,
  });
  return analysis;
}

/** Genre lookup only — used when another source already supplies BPM/key. */
export async function fetchGetSongBpmGenres(track: GetSongBpmTrackInput): Promise<string[]> {
  const { genres } = await fetchGetSongBpmData(track);
  if (genres.length > 0) {
    console.log("[getsongbpm] Genres:", { artist: track.artist, title: track.title, genres });
  }
  return genres;
}

