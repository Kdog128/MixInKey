/**
 * Community-documented Tunebat API (unofficial):
 * - Search: GET https://api.tunebat.com/api/tracks/search?term={query}
 * - Track:  GET https://api.tunebat.com/api/tracks?trackId={spotifyId}
 *
 * Reference: https://github.com/TheBrenny/tunebat-api
 */
import { parseMusicalKeyString, type CamelotKey } from "@/lib/camelot";
import type { AudioAnalysis } from "@/lib/audio-analysis";

const TUNEBAT_SEARCH_URL = "https://api.tunebat.com/api/tracks/search";
const TUNEBAT_TRACK_URL = "https://api.tunebat.com/api/tracks";

const MATCH_SCORE_THRESHOLD = 0.75;

interface TunebatTrack {
  id: string;
  n: string;
  as: string[];
  b?: number;
  k?: string;
  c?: string;
  d?: number;
}

const EMPTY: AudioAnalysis = {
  bpm: null,
  musicalKey: null,
  camelot: null,
  source: null,
};

function primaryArtist(artist: string): string {
  return artist.split(/\s feat\.|\s ft\.|,|\s & /i)[0].trim();
}

function normalizeTitle(title: string): string {
  return title
    .replace(/\s*[\(\[]?(feat\.|ft\.|with)[^\)\]]*[\)\]]?/gi, "")
    .trim();
}

function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/'/g, "'");
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

function parseTunebatJson(text: string): unknown {
  const cleaned = normalizeText(text);
  return JSON.parse(cleaned);
}

async function tunebatFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Origin: "https://tunebat.com",
      Referer: "https://tunebat.com/",
    },
    cache: "no-store",
  });
}

function trackToAnalysis(track: TunebatTrack): AudioAnalysis {
  const camelot: CamelotKey | null =
    (track.c ? parseMusicalKeyString(track.c) : null) ??
    (track.k ? parseMusicalKeyString(track.k) : null);

  return {
    bpm: typeof track.b === "number" && track.b > 0 ? Math.round(track.b) : null,
    musicalKey: track.k ?? null,
    camelot,
    source: "tunebat",
  };
}

function pickBestMatch(
  items: TunebatTrack[],
  artist: string,
  title: string,
  durationMs?: number
): TunebatTrack | null {
  if (items.length === 0) return null;

  const wantArtist = primaryArtist(artist).toLowerCase();
  const wantTitle = normalizeTitle(title);

  let best: TunebatTrack | null = null;
  let bestScore = -1;

  for (const item of items) {
    const titleScore = titleSimilarity(item.n, wantTitle);
    const artistMatch = item.as.some((a) => {
      const lower = a.toLowerCase();
      return lower === wantArtist || lower.includes(wantArtist) || wantArtist.includes(lower);
    });

    let score = titleScore * 0.7 + (artistMatch ? 0.3 : 0);
    if (durationMs && item.d) {
      const diff = Math.abs(item.d - durationMs);
      if (diff <= 5000) score += 0.15;
      else if (diff <= 15000) score += 0.05;
    }

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (!best || bestScore < MATCH_SCORE_THRESHOLD) return null;
  return best;
}

async function searchTunebat(artist: string, title: string, durationMs?: number): Promise<AudioAnalysis> {
  const query = `${primaryArtist(artist)} ${normalizeTitle(title)}`.trim();
  if (!query) return EMPTY;

  const url = `${TUNEBAT_SEARCH_URL}?term=${encodeURIComponent(query)}`;
  const res = await tunebatFetch(url);

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "60", 10);
    console.warn("[tunebat] Rate limited, retry after", retryAfter, "seconds");
    return EMPTY;
  }

  const bodyText = await res.text();
  if (!res.ok) {
    console.warn("[tunebat] Search failed:", { status: res.status, query });
    return EMPTY;
  }

  try {
    const parsed = parseTunebatJson(bodyText) as { data?: { items?: TunebatTrack[] } };
    const items = parsed.data?.items ?? [];
    const match = pickBestMatch(items, artist, title, durationMs);
    if (!match) {
      console.log("[tunebat] No confident match for:", query);
      return EMPTY;
    }
    console.log("[tunebat] Search match:", { title: match.n, artists: match.as, bpm: match.b, key: match.k });
    return trackToAnalysis(match);
  } catch (err) {
    console.warn("[tunebat] Failed to parse search response:", err);
    return EMPTY;
  }
}

async function fetchTunebatBySpotifyId(spotifyId: string): Promise<AudioAnalysis> {
  const url = `${TUNEBAT_TRACK_URL}?trackId=${encodeURIComponent(spotifyId)}`;
  const res = await tunebatFetch(url);

  const bodyText = await res.text();
  if (!res.ok) {
    console.warn("[tunebat] Track lookup failed:", { spotifyId, status: res.status });
    return EMPTY;
  }

  try {
    const parsed = parseTunebatJson(bodyText) as { data?: TunebatTrack };
    const track = parsed.data;
    if (!track?.id) return EMPTY;
    console.log("[tunebat] Spotify ID match:", { title: track.n, bpm: track.b, key: track.k });
    return trackToAnalysis(track);
  } catch (err) {
    console.warn("[tunebat] Failed to parse track response:", err);
    return EMPTY;
  }
}

export interface TunebatTrackInput {
  artist: string;
  title: string;
  duration_ms?: number;
  spotify_id?: string;
}

export async function fetchTunebatAnalysis(track: TunebatTrackInput): Promise<AudioAnalysis> {
  if (!track.artist.trim() && !track.title.trim() && !track.spotify_id) {
    return EMPTY;
  }

  try {
    if (track.spotify_id) {
      const byId = await fetchTunebatBySpotifyId(track.spotify_id);
      if (byId.bpm != null || byId.camelot != null || byId.musicalKey != null) {
        return byId;
      }
    }

    if (track.artist.trim() && track.title.trim()) {
      return await searchTunebat(track.artist, track.title, track.duration_ms);
    }

    return EMPTY;
  } catch (err) {
    console.error("[tunebat] Request error:", err);
    return EMPTY;
  }
}
