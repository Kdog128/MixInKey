import type { AudioAnalysis, TrackAudioInput } from "@/lib/audio-analysis";
import { parseMusicalKeyString } from "@/lib/camelot";
import { createSupabaseServerClient } from "@/lib/supabase";

/**
 * Expected Supabase table:
 *
 * create table tracks_cache (
 *   spotify_id text primary key,
 *   artist text,
 *   title text,
 *   bpm integer,
 *   musical_key text,
 *   camelot_label text,
 *   source text,
 *   popularity integer,
 *   genres text[] default '{}',
 *   cached_at timestamptz default now()
 * );
 */
export interface TracksCacheRow {
  spotify_id: string;
  artist: string | null;
  title: string | null;
  bpm: number | null;
  musical_key: string | null;
  camelot_label: string | null;
  source: string | null;
  popularity: number | null;
  genres: string[] | null;
  cached_at: string | null;
}

function hasCacheableAnalysis(analysis: AudioAnalysis): boolean {
  return (
    analysis.bpm != null ||
    analysis.camelot != null ||
    analysis.musicalKey != null ||
    analysis.genres.length > 0
  );
}

function rowToAnalysis(row: TracksCacheRow): AudioAnalysis {
  const camelot =
    (row.camelot_label ? parseMusicalKeyString(row.camelot_label) : null) ??
    (row.musical_key ? parseMusicalKeyString(row.musical_key) : null);

  const source = row.source as AudioAnalysis["source"];
  const validSource =
    source === "reccobeats" ||
    source === "getsongbpm" ||
    source === "soundnet" ||
    source === "musicbrainz"
      ? source
      : null;

  return {
    bpm: row.bpm,
    musicalKey: row.musical_key ?? camelot?.musicalKey ?? null,
    camelot,
    source: validSource,
    popularity: row.popularity,
    genres: row.genres ?? [],
  };
}

export async function getCachedTrackAnalysis(
  spotifyId: string
): Promise<AudioAnalysis | null> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("tracks_cache")
      .select("*")
      .eq("spotify_id", spotifyId)
      .maybeSingle();

    if (error) {
      console.warn("[tracks-cache] Read failed:", { spotifyId, message: error.message });
      return null;
    }
    if (!data) return null;

    const analysis = rowToAnalysis(data as TracksCacheRow);
    console.log("[tracks-cache] Hit:", { spotifyId, bpm: analysis.bpm, key: analysis.musicalKey });
    return analysis;
  } catch (err) {
    console.warn("[tracks-cache] Read error:", err);
    return null;
  }
}

export async function getCachedTracksAnalysis(
  spotifyIds: string[]
): Promise<Map<string, AudioAnalysis>> {
  const result = new Map<string, AudioAnalysis>();
  const ids = [...new Set(spotifyIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return result;

  const supabase = createSupabaseServerClient();
  if (!supabase) return result;

  try {
    const { data, error } = await supabase
      .from("tracks_cache")
      .select("*")
      .in("spotify_id", ids);

    if (error) {
      console.warn("[tracks-cache] Batch read failed:", error.message);
      return result;
    }

    for (const row of (data ?? []) as TracksCacheRow[]) {
      result.set(row.spotify_id, rowToAnalysis(row));
    }

    if (result.size > 0) {
      console.log("[tracks-cache] Batch hit:", [...result.keys()]);
    }
  } catch (err) {
    console.warn("[tracks-cache] Batch read error:", err);
  }

  return result;
}

export async function saveCachedTrackAnalysis(
  track: TrackAudioInput,
  analysis: AudioAnalysis
): Promise<void> {
  if (!track.spotify_id || !hasCacheableAnalysis(analysis)) return;

  const supabase = createSupabaseServerClient();
  if (!supabase) return;

  const row = {
    spotify_id: track.spotify_id,
    artist: track.artist,
    title: track.title,
    bpm: analysis.bpm,
    musical_key: analysis.musicalKey,
    camelot_label: analysis.camelot?.label ?? null,
    source: analysis.source,
    popularity: analysis.popularity,
    genres: analysis.genres,
    cached_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from("tracks_cache").upsert(row, {
      onConflict: "spotify_id",
    });

    if (error) {
      console.warn("[tracks-cache] Save failed:", {
        spotifyId: track.spotify_id,
        message: error.message,
      });
      return;
    }

    console.log("[tracks-cache] Saved:", {
      spotifyId: track.spotify_id,
      bpm: analysis.bpm,
      key: analysis.musicalKey,
      genres: analysis.genres.length,
    });
  } catch (err) {
    console.warn("[tracks-cache] Save error:", err);
  }
}
