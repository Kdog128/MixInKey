export interface FavoriteTrack {
  name: string;
  artist: string;
  spotify_id: string;
  bpm: number | null;
  key: string | null;
  saved_at: string;
}

const STORAGE_KEY = "dj-companion-favorites";

function readFavorites(): FavoriteTrack[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FavoriteTrack[]) : [];
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

export function isFavorite(spotifyId: string): boolean {
  return readFavorites().some((t) => t.spotify_id === spotifyId);
}

export function saveFavorite(track: Omit<FavoriteTrack, "saved_at">): FavoriteTrack[] {
  const entry: FavoriteTrack = {
    ...track,
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
