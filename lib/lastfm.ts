/**
 * Last.fm API — https://www.last.fm/api
 */
const API_BASE = "https://ws.audioscrobbler.com/2.0/";

/** Tags Last.fm users often add that aren't useful as genres. */
const IGNORED_TAGS = new Set([
  "seen live",
  "favourites",
  "favorite",
  "favorites",
  "awesome",
  "love",
  "amazing",
  "beautiful",
  "cool",
  "good",
  "great",
  "nice",
  "perfect",
  "best",
  "fun",
  "happy",
  "sad",
  "chill",
  "relax",
  "summer",
  "winter",
  "spring",
  "autumn",
  "party",
  "dance",
  "workout",
  "sleep",
  "study",
]);

interface LastFmTag {
  name?: string;
  url?: string;
}

interface LastFmArtistGetInfoResponse {
  artist?: {
    name?: string;
    tags?: {
      tag?: LastFmTag | LastFmTag[];
    };
  };
  error?: number;
  message?: string;
}

function getApiKey(): string | null {
  const key = process.env.LASTFM_API_KEY?.trim();
  return key || null;
}

function primaryArtist(artist: string): string {
  return artist.split(/\s feat\.|\s ft\.|,|\s & /i)[0].trim();
}

function extractTags(data: LastFmArtistGetInfoResponse): string[] {
  const raw = data.artist?.tags?.tag;
  if (!raw) return [];

  const tags = Array.isArray(raw) ? raw : [raw];
  const genres: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const name = tag.name?.trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (IGNORED_TAGS.has(key) || seen.has(key)) continue;

    seen.add(key);
    genres.push(name);
  }

  return genres;
}

export async function fetchLastFmArtistGenres(artist: string): Promise<string[]> {
  const apiKey = getApiKey();
  const artistName = primaryArtist(artist).trim();

  if (!apiKey) {
    console.warn("[lastfm] LASTFM_API_KEY is not set");
    return [];
  }
  if (!artistName) return [];

  const url = `${API_BASE}?${new URLSearchParams({
    method: "artist.getinfo",
    artist: artistName,
    api_key: apiKey,
    format: "json",
  }).toString()}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn("[lastfm] Request failed:", { status: res.status, artist: artistName });
      return [];
    }

    const data = (await res.json()) as LastFmArtistGetInfoResponse;
    if (data.error) {
      console.warn("[lastfm] API error:", { artist: artistName, message: data.message });
      return [];
    }

    const genres = extractTags(data);
    if (genres.length > 0) {
      console.log("[lastfm] Genres:", { artist: artistName, genres });
    }
    return genres;
  } catch (err) {
    console.error("[lastfm] Request error:", err);
    return [];
  }
}
