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

interface LastFmSimilarTrackItem {
  name?: string;
  artist?: { name?: string } | string;
}

interface LastFmTrackGetSimilarResponse {
  similartracks?: {
    track?: LastFmSimilarTrackItem | LastFmSimilarTrackItem[];
  };
  error?: number;
  message?: string;
}

export interface LastFmSimilarTrack {
  name: string;
  artist: string;
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

function similarTrackArtist(item: LastFmSimilarTrackItem): string {
  const artist = item.artist;
  if (typeof artist === "string") return artist.trim();
  return artist?.name?.trim() ?? "";
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

export async function fetchLastFmSimilarTracks(
  trackName: string,
  artistName: string,
  limit = 20
): Promise<LastFmSimilarTrack[]> {
  const apiKey = getApiKey();
  const track = trackName.trim();
  const artist = primaryArtist(artistName).trim();

  if (!apiKey) {
    console.warn("[lastfm] LASTFM_API_KEY is not set");
    return [];
  }
  if (!track || !artist) return [];

  const url = `${API_BASE}?${new URLSearchParams({
    method: "track.getsimilar",
    track,
    artist,
    api_key: apiKey,
    format: "json",
    limit: String(limit),
  }).toString()}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn("[lastfm] track.getsimilar failed:", { status: res.status, track, artist });
      return [];
    }

    const data = (await res.json()) as LastFmTrackGetSimilarResponse;
    if (data.error) {
      console.warn("[lastfm] track.getsimilar API error:", { track, artist, message: data.message });
      return [];
    }

    const raw = data.similartracks?.track;
    if (!raw) return [];

    const items = Array.isArray(raw) ? raw : [raw];
    const results: LastFmSimilarTrack[] = [];

    for (const item of items) {
      const name = item.name?.trim();
      const itemArtist = similarTrackArtist(item);
      if (!name || !itemArtist) continue;
      results.push({ name, artist: itemArtist });
    }

    return results;
  } catch (err) {
    console.error("[lastfm] track.getsimilar error:", err);
    return [];
  }
}
