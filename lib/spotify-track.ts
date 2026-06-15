export interface SpotifyTrackResult {
  id: string;
  name: string;
  artist: string;
  artist_id: string | null;
  album: string;
  image: string | null;
  preview_url: string | null;
  duration_ms: number;
  popularity: number;
  explicit: boolean;
  release_date: string | null;
}

export interface SpotifyApiTrack {
  id: string;
  name: string;
  popularity?: number;
  explicit?: boolean;
  artists: Array<{ id: string; name: string }>;
  album: {
    name: string;
    release_date?: string;
    images?: Array<{ url: string }>;
  };
  preview_url?: string | null;
  duration_ms: number;
}

export function mapSpotifyTrack(track: SpotifyApiTrack): SpotifyTrackResult {
  return {
    id: track.id,
    name: track.name,
    artist: track.artists.map((a) => a.name).join(", "),
    artist_id: track.artists[0]?.id ?? null,
    album: track.album.name,
    image: track.album.images?.[1]?.url ?? track.album.images?.[0]?.url ?? null,
    preview_url: track.preview_url ?? null,
    duration_ms: track.duration_ms,
    popularity: track.popularity ?? 0,
    explicit: track.explicit ?? false,
    release_date: track.album.release_date ?? null,
  };
}
