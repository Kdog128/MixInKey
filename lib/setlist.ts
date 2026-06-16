import type { TrackFeatures } from "@/components/compatibility-card";
import type { TrackResult } from "@/components/track-search";

export interface SetlistTrack {
  spotify_id: string;
  position: number;
  name: string;
  artist: string;
  album: string;
  image: string | null;
  bpm: number | null;
  original_bpm: number | null;
  musical_key: string | null;
  camelot_label: string | null;
  duration_ms: number;
}

const STORAGE_KEY = "dj-companion-setlist";

export function normalizeSetlistTrack(track: SetlistTrack): SetlistTrack {
  const bpm = track.bpm ?? null;
  const image = track.image?.trim() || null;
  return {
    ...track,
    image,
    original_bpm: track.original_bpm ?? bpm,
  };
}

function readTracks(): SetlistTrack[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as SetlistTrack[]).map(normalizeSetlistTrack)
      : [];
  } catch {
    return [];
  }
}

function writeTracks(tracks: SetlistTrack[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
}

function withPositions(tracks: SetlistTrack[]): SetlistTrack[] {
  return tracks.map((track, index) => ({ ...track, position: index + 1 }));
}

export function getSetlistTracks(): SetlistTrack[] {
  return readTracks();
}

export function setSetlistTracks(tracks: SetlistTrack[]): SetlistTrack[] {
  const normalized = withPositions(tracks);
  writeTracks(normalized);
  return normalized;
}

export function buildSetlistTrack(
  track: TrackResult,
  features?: Pick<TrackFeatures, "bpm" | "musical_key" | "camelot"> | null,
  position = 0
): SetlistTrack {
  return {
    spotify_id: track.id,
    position,
    name: track.name,
    artist: track.artist,
    album: track.album,
    image: track.image,
    bpm: features?.bpm ?? null,
    original_bpm: features?.bpm ?? null,
    musical_key: features?.musical_key ?? null,
    camelot_label: features?.camelot?.label ?? null,
    duration_ms: track.duration_ms,
  };
}

export function addTrackToSetlist(track: SetlistTrack): {
  tracks: SetlistTrack[];
  added: boolean;
} {
  const existing = readTracks();
  if (existing.some((t) => t.spotify_id === track.spotify_id)) {
    return { tracks: existing, added: false };
  }
  const tracks = withPositions([...existing, { ...track, position: existing.length + 1 }]);
  writeTracks(tracks);
  return { tracks, added: true };
}

export function removeTrackFromSetlist(spotifyId: string): SetlistTrack[] {
  const tracks = withPositions(readTracks().filter((t) => t.spotify_id !== spotifyId));
  writeTracks(tracks);
  return tracks;
}

export function reorderSetlistTracks(fromIndex: number, toIndex: number): SetlistTrack[] {
  const tracks = [...readTracks()];
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= tracks.length ||
    toIndex >= tracks.length ||
    fromIndex === toIndex
  ) {
    return tracks;
  }
  const [moved] = tracks.splice(fromIndex, 1);
  tracks.splice(toIndex, 0, moved);
  return setSetlistTracks(tracks);
}

export function clearSetlistTracks(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function formatSetDuration(trackCount: number, minutesPerTrack = 6): string {
  const totalMinutes = trackCount * minutesPerTrack;
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}
