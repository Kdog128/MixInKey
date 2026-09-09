import type { TrackResult } from "@/components/track-search";

export function compatibilityPairHref(trackAId: string, trackBId: string): string {
  const params = new URLSearchParams({ a: trackAId, b: trackBId });
  return `/?${params.toString()}`;
}

export function metadataToTrackResult(
  id: string,
  meta: {
    name?: string;
    artist?: string;
    album?: string;
    image?: string | null;
    duration_ms?: number;
  }
): TrackResult {
  return {
    id,
    name: meta.name?.trim() || "Unknown Track",
    artist: meta.artist?.trim() || "Unknown Artist",
    artist_id: null,
    album: meta.album?.trim() || "",
    image: meta.image?.trim() || null,
    preview_url: null,
    duration_ms: meta.duration_ms ?? 0,
    popularity: 0,
    explicit: false,
    release_date: null,
  };
}
