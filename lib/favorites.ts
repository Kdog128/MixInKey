export interface FavoriteTrack {
  name: string;
  artist: string;
  spotify_id: string;
  bpm: number | null;
  key: string | null;
  image: string | null;
  saved_at: string;
}

const STORAGE_KEY = "dj-companion-favorites";

type StoredFavorite = Partial<FavoriteTrack> & {
  spotify_id: string;
  artwork_url?: string | null;
};

function normalizeFavorite(raw: StoredFavorite): FavoriteTrack {
  const legacyImage = raw.image?.trim() || raw.artwork_url?.trim() || null;
  return {
    name: raw.name ?? "",
    artist: raw.artist ?? "",
    spotify_id: raw.spotify_id,
    bpm: raw.bpm ?? null,
    key: raw.key ?? null,
    image: legacyImage,
    saved_at: raw.saved_at ?? new Date().toISOString(),
  };
}

function readFavorites(): FavoriteTrack[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as StoredFavorite[]).map(normalizeFavorite)
      : [];
  } catch {
    return [];
  }
}

function writeFavorites(favorites: FavoriteTrack[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
}

export function getFavorites(): FavoriteTrack[] {
  return readFavorites();
}

export function setFavorites(favorites: FavoriteTrack[]): FavoriteTrack[] {
  const normalized = favorites.map(normalizeFavorite);
  writeFavorites(normalized);
  return normalized;
}

export function isFavorite(spotifyId: string): boolean {
  return readFavorites().some((t) => t.spotify_id === spotifyId);
}

export function saveFavorite(track: Omit<FavoriteTrack, "saved_at">): FavoriteTrack[] {
  const existing = readFavorites().find((t) => t.spotify_id === track.spotify_id);
  const image = track.image?.trim() || existing?.image?.trim() || null;
  const entry: FavoriteTrack = {
    ...track,
    image,
    saved_at: new Date().toISOString(),
  };
  const favorites = readFavorites().filter((t) => t.spotify_id !== track.spotify_id);
  favorites.unshift(entry);
  writeFavorites(favorites);
  return favorites;
}

export function removeFavorite(spotifyId: string): FavoriteTrack[] {
  const favorites = readFavorites().filter((t) => t.spotify_id !== spotifyId);
  writeFavorites(favorites);
  return favorites;
}

export function toggleFavorite(track: Omit<FavoriteTrack, "saved_at">): {
  favorites: FavoriteTrack[];
  favorited: boolean;
} {
  if (isFavorite(track.spotify_id)) {
    return { favorites: removeFavorite(track.spotify_id), favorited: false };
  }
  return { favorites: saveFavorite(track), favorited: true };
}

export async function enrichFavoritesWithImages(
  favorites: FavoriteTrack[]
): Promise<FavoriteTrack[]> {
  const missingIds = favorites
    .filter((favorite) => !favorite.image?.trim())
    .map((favorite) => favorite.spotify_id);
  if (missingIds.length === 0) return favorites;

  try {
    const res = await fetch("/api/tracks/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spotify_ids: missingIds }),
    });
    const data = (await res.json()) as {
      tracks?: Record<string, { image?: string | null }>;
    };
    if (!res.ok || !data.tracks) return favorites;

    let changed = false;
    const enriched = favorites.map((favorite) => {
      const image = data.tracks?.[favorite.spotify_id]?.image?.trim();
      if (!image || favorite.image?.trim()) return favorite;
      changed = true;
      return { ...favorite, image };
    });

    return changed ? setFavorites(enriched) : favorites;
  } catch {
    return favorites;
  }
}
