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
 *   artwork_url text,
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
  artwork_url: string | null;
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

export async function getCachedTrackRowsByIds(
  spotifyIds: string[]
): Promise<Map<string, TracksCacheRow>> {
  const result = new Map<string, TracksCacheRow>();
  const ids = [...new Set(spotifyIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return result;

  const supabase = createSupabaseServerClient();
  if (!supabase) return result;

  try {
    const { data, error } = await supabase
      .from("tracks_cache")
      .select(
        "spotify_id, artist, title, bpm, musical_key, camelot_label, artwork_url, source, popularity, genres, cached_at"
      )
      .in("spotify_id", ids);

    if (error) {
      console.warn("[tracks-cache] Batch rows read failed:", error.message);
      return result;
    }

    for (const row of (data ?? []) as TracksCacheRow[]) {
      result.set(row.spotify_id, row);
    }
  } catch (err) {
    console.warn("[tracks-cache] Batch rows read error:", err);
  }

  return result;
}

export async function getRecentCachedArtworkUrls(limit = 25): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return [];

  const cappedLimit = Math.min(Math.max(limit, 1), 30);

  try {
    const { data, error } = await supabase
      .from("tracks_cache")
      .select("artwork_url, cached_at")
      .not("artwork_url", "is", null)
      .neq("artwork_url", "")
      .order("cached_at", { ascending: false })
      .limit(cappedLimit * 3);

    if (error || !data) {
      console.warn("[tracks-cache] Artwork wall read failed:", error?.message);
      return [];
    }

    const seen = new Set<string>();
    const urls: string[] = [];

    for (const row of data as Pick<TracksCacheRow, "artwork_url">[]) {
      const url = row.artwork_url?.trim();
      if (!url || seen.has(url)) continue;
      if (!/^https?:\/\//i.test(url)) continue;
      seen.add(url);
      urls.push(url);
      if (urls.length >= cappedLimit) break;
    }

    return urls;
  } catch (err) {
    console.warn("[tracks-cache] Artwork wall read error:", err);
    return [];
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

export async function upsertTrackCacheMetadata(track: TrackAudioInput): Promise<void> {
  if (!track.spotify_id) return;

  const artwork = track.artwork_url?.trim();
  const artist = track.artist?.trim();
  const title = track.title?.trim();
  if (!artwork && !artist && !title) return;

  const supabase = createSupabaseServerClient();
  if (!supabase) return;

  const existing = (await getCachedTrackRowsByIds([track.spotify_id])).get(track.spotify_id);

  const row = {
    spotify_id: track.spotify_id,
    artist: artist || existing?.artist || null,
    title: title || existing?.title || null,
    bpm: existing?.bpm ?? null,
    musical_key: existing?.musical_key ?? null,
    camelot_label: existing?.camelot_label ?? null,
    source: existing?.source ?? null,
    popularity: existing?.popularity ?? null,
    genres: existing?.genres ?? null,
    artwork_url: artwork || existing?.artwork_url?.trim() || null,
    cached_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from("tracks_cache").upsert(row, {
      onConflict: "spotify_id",
    });

    if (error) {
      console.warn("[tracks-cache] Metadata save failed:", {
        spotifyId: track.spotify_id,
        message: error.message,
      });
    }
  } catch (err) {
    console.warn("[tracks-cache] Metadata save error:", err);
  }
}

export async function saveCachedTrackAnalysis(
  track: TrackAudioInput,
  analysis: AudioAnalysis
): Promise<void> {
  if (!track.spotify_id) return;

  const existing = (await getCachedTrackRowsByIds([track.spotify_id])).get(track.spotify_id);
  const hasAnalysis = hasCacheableAnalysis(analysis);
  const hasArtwork = Boolean(track.artwork_url?.trim() || existing?.artwork_url?.trim());
  if (!hasAnalysis && !hasArtwork) return;

  const supabase = createSupabaseServerClient();
  if (!supabase) return;

  const row = {
    spotify_id: track.spotify_id,
    artist: track.artist?.trim() || existing?.artist || null,
    title: track.title?.trim() || existing?.title || null,
    bpm: hasAnalysis ? analysis.bpm : (existing?.bpm ?? null),
    musical_key: hasAnalysis ? analysis.musicalKey : (existing?.musical_key ?? null),
    camelot_label: hasAnalysis
      ? (analysis.camelot?.label ?? null)
      : (existing?.camelot_label ?? null),
    source: hasAnalysis ? analysis.source : (existing?.source ?? null),
    popularity: hasAnalysis ? analysis.popularity : (existing?.popularity ?? null),
    genres: hasAnalysis ? analysis.genres : (existing?.genres ?? null),
    artwork_url: track.artwork_url?.trim() || existing?.artwork_url?.trim() || null,
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
