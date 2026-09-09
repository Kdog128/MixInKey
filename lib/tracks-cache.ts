import type { AudioAnalysis, AudioAnalysisSource, TrackAudioInput } from "@/lib/audio-analysis";
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
 *   release_date text,
 *   cached_at timestamptz default now(),
 *   lookup_attempted_at timestamptz
 *   essentia_attempted_at timestamptz
 * );
 *
 * alter table tracks_cache
 *   add column if not exists lookup_attempted_at timestamptz;
 *
 * alter table tracks_cache
 *   add column if not exists essentia_attempted_at timestamptz;
 *
 * alter table tracks_cache
 *   add column if not exists release_date text;
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
  release_date: string | null;
  cached_at: string | null;
  lookup_attempted_at: string | null;
  essentia_attempted_at: string | null;
}

export interface CachedAudioAnalysis extends AudioAnalysis {
  lookupAttemptedAt: string | null;
  essentiaAttemptedAt: string | null;
}

export const NEGATIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const TRACKS_CACHE_SELECT_WITH_RELEASE =
  "spotify_id, artist, title, bpm, musical_key, camelot_label, artwork_url, source, popularity, genres, release_date, cached_at, lookup_attempted_at, essentia_attempted_at";

const TRACKS_CACHE_SELECT_WITHOUT_RELEASE =
  "spotify_id, artist, title, bpm, musical_key, camelot_label, artwork_url, source, popularity, genres, cached_at, lookup_attempted_at, essentia_attempted_at";

let tracksCacheSelect = TRACKS_CACHE_SELECT_WITH_RELEASE;

function noteMissingReleaseDateColumn(message: string | undefined): boolean {
  if (!tracksCacheSelect.includes("release_date")) return false;
  if (!/release_date/i.test(message ?? "")) return false;
  console.warn("[tracks-cache] release_date column missing; continuing without it");
  tracksCacheSelect = TRACKS_CACHE_SELECT_WITHOUT_RELEASE;
  return true;
}

function canWriteReleaseDate(): boolean {
  return tracksCacheSelect.includes("release_date");
}

function readLookupAttemptedAt(row: TracksCacheRow | Record<string, unknown>): string | null {
  const raw =
    (row as Record<string, unknown>).lookup_attempted_at ??
    (row as Record<string, unknown>).lookupAttemptedAt;
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return raw.toISOString();
  return String(raw);
}

function readEssentiaAttemptedAt(row: TracksCacheRow | Record<string, unknown>): string | null {
  const raw =
    (row as Record<string, unknown>).essentia_attempted_at ??
    (row as Record<string, unknown>).essentiaAttemptedAt;
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return raw.toISOString();
  return String(raw);
}

/** Postgres/PostgREST timestamps may be `…T…+00` which Date.parse rejects. */
function lookupAttemptedAtMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return direct;

  const withT = value.includes("T") ? value : value.replace(" ", "T");
  const withColonOffset = withT.replace(/([+-]\d{2})$/, "$1:00");
  const parsed = Date.parse(withColonOffset);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowToAnalysis(row: TracksCacheRow): CachedAudioAnalysis {
  const camelot =
    (row.camelot_label ? parseMusicalKeyString(row.camelot_label) : null) ??
    (row.musical_key ? parseMusicalKeyString(row.musical_key) : null);

  const source = row.source as AudioAnalysisSource;
  const validSource =
    source === "reccobeats" ||
    source === "getsongbpm" ||
    source === "soundnet" ||
    source === "musicbrainz" ||
    source === "essentia"
      ? source
      : null;

  return {
    bpm: row.bpm,
    musicalKey: row.musical_key ?? camelot?.musicalKey ?? null,
    camelot,
    source: validSource,
    popularity: row.popularity,
    genres: row.genres ?? [],
    lookupAttemptedAt: readLookupAttemptedAt(row),
    essentiaAttemptedAt: readEssentiaAttemptedAt(row),
  };
}

/** BPM/key pipeline succeeded — safe to skip re-fetching external audio sources. */
export function hasResolvedBpmKeyCache(
  entry:
    | Pick<AudioAnalysis, "bpm" | "musicalKey" | "camelot">
    | Pick<TracksCacheRow, "bpm" | "musical_key" | "camelot_label">
): boolean {
  if ("musical_key" in entry) {
    return (
      entry.bpm != null || entry.musical_key != null || entry.camelot_label != null
    );
  }
  return entry.bpm != null || entry.musicalKey != null || entry.camelot != null;
}

function hasCacheableAnalysis(analysis: AudioAnalysis): boolean {
  return hasResolvedBpmKeyCache(analysis) || analysis.genres.length > 0;
}

function hasUsableBpmAndKey(analysis: Pick<AudioAnalysis, "bpm" | "musicalKey">): boolean {
  return analysis.bpm != null && analysis.musicalKey != null;
}

/** Incomplete BPM/key after a full provider pass — skip re-fetching until TTL expires. */
export function isFreshNegativeCache(entry: {
  bpm: number | null;
  musicalKey: string | null;
  lookupAttemptedAt?: string | null;
}): boolean {
  if (hasUsableBpmAndKey(entry)) return false;
  const attempted = lookupAttemptedAtMs(entry.lookupAttemptedAt);
  if (attempted == null) return false;
  return Date.now() - attempted < NEGATIVE_CACHE_TTL_MS;
}

export function isFreshEssentiaAttempt(entry: {
  essentiaAttemptedAt?: string | null;
}): boolean {
  const attempted = lookupAttemptedAtMs(entry.essentiaAttemptedAt);
  if (attempted == null) return false;
  return Date.now() - attempted < NEGATIVE_CACHE_TTL_MS;
}

export function needsEssentiaFallback(entry: {
  bpm: number | null;
  musicalKey: string | null;
  essentiaAttemptedAt?: string | null;
}): boolean {
  return !hasUsableBpmAndKey(entry) && !isFreshEssentiaAttempt(entry);
}

export async function getCachedTrackAnalysis(
  spotifyId: string
): Promise<CachedAudioAnalysis | null> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("tracks_cache")
      .select(tracksCacheSelect)
      .eq("spotify_id", spotifyId)
      .maybeSingle();

    if (error) {
      if (noteMissingReleaseDateColumn(error.message)) {
        return getCachedTrackAnalysis(spotifyId);
      }
      console.warn("[tracks-cache] Read failed:", { spotifyId, message: error.message });
      return null;
    }
    if (!data) return null;

    const analysis = rowToAnalysis(data as TracksCacheRow);
    if (hasUsableBpmAndKey(analysis)) {
      console.log("[tracks-cache] Hit:", {
        spotifyId,
        bpm: analysis.bpm,
        key: analysis.musicalKey,
      });
    } else if (isFreshNegativeCache(analysis)) {
      console.log("[tracks-cache] Negative hit:", {
        spotifyId,
        lookupAttemptedAt: analysis.lookupAttemptedAt,
        genres: analysis.genres.length,
      });
    } else {
      console.log("[tracks-cache] Partial hit (BPM/key unresolved):", {
        spotifyId,
        genres: analysis.genres.length,
      });
    }
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
      .select(tracksCacheSelect)
      .in("spotify_id", ids);

    if (error) {
      if (noteMissingReleaseDateColumn(error.message)) {
        return getCachedTrackRowsByIds(spotifyIds);
      }
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

export async function getRecentCachedArtworkUrls(limit = 72): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    console.warn("[tracks-cache] Artwork wall: Supabase client unavailable");
    return [];
  }

  const cappedLimit = Math.min(Math.max(limit, 1), 500);

  try {
    const { data, error } = await supabase
      .from("tracks_cache")
      .select("artwork_url, cached_at")
      .not("artwork_url", "is", null)
      .neq("artwork_url", "")
      .order("cached_at", { ascending: false })
      .limit(500);

    if (error || !data) {
      console.warn("[tracks-cache] Artwork wall read failed:", error?.message);
      return [];
    }

    const seen = new Set<string>();
    const urls: string[] = [];
    let rowsWithDuplicateArtwork = 0;

    for (const row of data as Pick<TracksCacheRow, "artwork_url">[]) {
      const url = row.artwork_url?.trim();
      if (!url || !/^https?:\/\//i.test(url)) continue;
      if (seen.has(url)) {
        rowsWithDuplicateArtwork++;
        continue;
      }
      seen.add(url);
      urls.push(url);
      if (urls.length >= cappedLimit) break;
    }

    console.log("[tracks-cache] Artwork wall Supabase result:", {
      rowsFetched: data.length,
      duplicateArtworkRowsSkipped: rowsWithDuplicateArtwork,
      uniqueArtworkUrls: urls.length,
      requestedLimit: cappedLimit,
    });

    return urls;
  } catch (err) {
    console.warn("[tracks-cache] Artwork wall read error:", err);
    return [];
  }
}

export async function getCachedTracksWithBpmAndKey(): Promise<TracksCacheRow[]> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("tracks_cache")
      .select(tracksCacheSelect)
      .not("bpm", "is", null)
      .or("musical_key.not.is.null,camelot_label.not.is.null");

    if (error) {
      if (noteMissingReleaseDateColumn(error.message)) {
        return getCachedTracksWithBpmAndKey();
      }
      console.warn("[tracks-cache] BPM/key catalog read failed:", error.message);
      return [];
    }

    const rows = ((data ?? []) as TracksCacheRow[]).filter(
      (row) => row.bpm != null && (row.musical_key?.trim() || row.camelot_label?.trim())
    );
    console.log("[tracks-cache] BPM/key catalog:", rows.length);
    return rows;
  } catch (err) {
    console.warn("[tracks-cache] BPM/key catalog read error:", err);
    return [];
  }
}

export async function getCachedTracksAnalysis(
  spotifyIds: string[]
): Promise<Map<string, CachedAudioAnalysis>> {
  const result = new Map<string, CachedAudioAnalysis>();
  const ids = [...new Set(spotifyIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return result;

  const supabase = createSupabaseServerClient();
  if (!supabase) return result;

  try {
    const { data, error } = await supabase
      .from("tracks_cache")
      .select(tracksCacheSelect)
      .in("spotify_id", ids);

    if (error) {
      if (noteMissingReleaseDateColumn(error.message)) {
        return getCachedTracksAnalysis(spotifyIds);
      }
      console.warn("[tracks-cache] Batch read failed:", error.message);
      return result;
    }

    for (const row of (data ?? []) as TracksCacheRow[]) {
      const analysis = rowToAnalysis(row);
      result.set(row.spotify_id, analysis);
      console.log("[tracks-cache] Batch row mapped:", {
        spotify_id: row.spotify_id,
        bpm: analysis.bpm,
        musical_key: analysis.musicalKey,
        lookup_attempted_at: analysis.lookupAttemptedAt,
        raw_lookup_attempted_at: (row as Record<string, unknown>).lookup_attempted_at ?? null,
      });
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
  const patch: Record<string, unknown> = {
    artist: artist || existing?.artist || null,
    title: title || existing?.title || null,
    artwork_url: artwork || existing?.artwork_url?.trim() || null,
    cached_at: new Date().toISOString(),
  };
  const releaseDate = track.release_date?.trim();
  if (canWriteReleaseDate() && releaseDate) patch.release_date = releaseDate;

  try {
    const { data, error } = await supabase
      .from("tracks_cache")
      .update(patch)
      .eq("spotify_id", track.spotify_id)
      .select("spotify_id");

    if (error) {
      if (noteMissingReleaseDateColumn(error.message)) {
        return upsertTrackCacheMetadata(track);
      }
      console.warn("[tracks-cache] Metadata save failed:", {
        spotifyId: track.spotify_id,
        message: error.message,
      });
      return;
    }

    if (data && data.length > 0) return;

    const { error: insertError } = await supabase.from("tracks_cache").insert({
      spotify_id: track.spotify_id,
      ...patch,
      bpm: null,
      musical_key: null,
      camelot_label: null,
      source: null,
      popularity: null,
      genres: null,
      lookup_attempted_at: null,
      essentia_attempted_at: null,
    });

    if (insertError && insertError.code !== "23505") {
      if (noteMissingReleaseDateColumn(insertError.message)) {
        return upsertTrackCacheMetadata(track);
      }
      console.warn("[tracks-cache] Metadata insert failed:", {
        spotifyId: track.spotify_id,
        message: insertError.message,
      });
    }
  } catch (err) {
    console.warn("[tracks-cache] Metadata save error:", err);
  }
}

const essentiaResolvedIds = new Set<string>();

export function markEssentiaResolved(spotifyId: string): void {
  if (spotifyId) essentiaResolvedIds.add(spotifyId);
}

export function isEssentiaResolved(spotifyId: string): boolean {
  return Boolean(spotifyId) && essentiaResolvedIds.has(spotifyId);
}

export async function saveCachedTrackAnalysis(
  track: TrackAudioInput,
  analysis: AudioAnalysis,
  options?: { completedLookup?: boolean; essentiaAttempted?: boolean }
): Promise<void> {
  if (!track.spotify_id) return;

  const completedLookup = options?.completedLookup === true;
  const hasAnalysis = hasCacheableAnalysis(analysis);
  const incomingHasUsable = hasUsableBpmAndKey(analysis);
  if (!hasAnalysis && !completedLookup && !options?.essentiaAttempted && !track.artwork_url?.trim()) {
    return;
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) return;

  const existing = (await getCachedTrackRowsByIds([track.spotify_id])).get(track.spotify_id);
  const existingHasUsable =
    existing != null && existing.bpm != null && Boolean(existing.musical_key);
  const now = new Date().toISOString();
  const incomingIsEssentia = analysis.source === "essentia" && incomingHasUsable;
  const essentiaAlreadyWon =
    !incomingIsEssentia &&
    (isEssentiaResolved(track.spotify_id) ||
      (existing?.source === "essentia" && existingHasUsable));

  if (
    (!incomingHasUsable || essentiaAlreadyWon) &&
    (existingHasUsable || isEssentiaResolved(track.spotify_id) || essentiaAlreadyWon)
  ) {
    const patch: Record<string, unknown> = { cached_at: now };
    if (analysis.genres.length > 0) patch.genres = analysis.genres;
    const artwork = track.artwork_url?.trim();
    if (artwork) patch.artwork_url = artwork;
    const releaseDate = track.release_date?.trim();
    if (canWriteReleaseDate() && releaseDate) patch.release_date = releaseDate;

    if (Object.keys(patch).length === 1 && existingHasUsable) {
      console.log("[tracks-cache] Skipping provider miss; bpm/key already present:", {
        spotifyId: track.spotify_id,
        bpm: existing?.bpm ?? null,
        key: existing?.musical_key ?? null,
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("tracks_cache")
        .update(patch)
        .eq("spotify_id", track.spotify_id);
      if (error) {
        if (noteMissingReleaseDateColumn(error.message)) {
          return saveCachedTrackAnalysis(track, analysis, options);
        }
        console.warn("[tracks-cache] Preserve-only update failed:", {
          spotifyId: track.spotify_id,
          message: error.message,
        });
        return;
      }
      console.log("[tracks-cache] Saved:", {
        spotifyId: track.spotify_id,
        bpm: existing?.bpm ?? null,
        key: existing?.musical_key ?? null,
        genres: analysis.genres.length || existing?.genres?.length || 0,
        preservedBpmKey: true,
        lookupAttemptedAt: existing?.lookup_attempted_at ?? null,
        essentiaAttemptedAt: existing?.essentia_attempted_at ?? null,
      });
    } catch (err) {
      console.warn("[tracks-cache] Preserve-only update error:", err);
    }
    return;
  }

  if (!incomingHasUsable && existing && !existingHasUsable) {
    const patch: Record<string, unknown> = {
      cached_at: now,
      artist: track.artist?.trim() || existing.artist || null,
      title: track.title?.trim() || existing.title || null,
      artwork_url: track.artwork_url?.trim() || existing.artwork_url || null,
      genres: analysis.genres.length > 0 ? analysis.genres : existing.genres,
      lookup_attempted_at:
        completedLookup || options?.essentiaAttempted ? now : existing.lookup_attempted_at,
      essentia_attempted_at: options?.essentiaAttempted
        ? now
        : existing.essentia_attempted_at,
    };
    if (analysis.popularity != null) patch.popularity = analysis.popularity;
    if (canWriteReleaseDate()) {
      patch.release_date = track.release_date?.trim() || existing.release_date;
    }

    try {
      const { data, error } = await supabase
        .from("tracks_cache")
        .update(patch)
        .eq("spotify_id", track.spotify_id)
        .is("bpm", null)
        .select("spotify_id");
      if (error) {
        if (noteMissingReleaseDateColumn(error.message)) {
          return saveCachedTrackAnalysis(track, analysis, options);
        }
        console.warn("[tracks-cache] Miss update failed:", {
          spotifyId: track.spotify_id,
          message: error.message,
        });
        return;
      }
      if (!data?.length) {
        console.log("[tracks-cache] Miss update skipped; bpm already present:", {
          spotifyId: track.spotify_id,
        });
        return;
      }
      console.log("[tracks-cache] Saved:", {
        spotifyId: track.spotify_id,
        bpm: null,
        key: null,
        genres: analysis.genres.length,
        lookupAttemptedAt: patch.lookup_attempted_at,
        essentiaAttemptedAt: patch.essentia_attempted_at,
      });
    } catch (err) {
      console.warn("[tracks-cache] Miss update error:", err);
    }
    return;
  }

  const bpm = analysis.bpm ?? existing?.bpm ?? null;
  const musicalKey = analysis.musicalKey?.trim() || existing?.musical_key || null;
  const camelotLabel = analysis.camelot?.label || existing?.camelot_label || null;
  const rowHasUsable = bpm != null && Boolean(musicalKey);
  const lookupAttemptedAt = rowHasUsable
    ? null
    : completedLookup || options?.essentiaAttempted
      ? now
      : (existing?.lookup_attempted_at ?? null);
  const essentiaAttemptedAt = rowHasUsable
    ? null
    : options?.essentiaAttempted
      ? now
      : (existing?.essentia_attempted_at ?? null);

  const row: Record<string, unknown> = {
    spotify_id: track.spotify_id,
    artist: track.artist?.trim() || existing?.artist || null,
    title: track.title?.trim() || existing?.title || null,
    bpm,
    musical_key: musicalKey,
    camelot_label: camelotLabel,
    source: incomingHasUsable ? analysis.source : (existing?.source ?? analysis.source),
    popularity: analysis.popularity ?? existing?.popularity ?? null,
    genres: analysis.genres.length > 0 ? analysis.genres : (existing?.genres ?? null),
    artwork_url: track.artwork_url?.trim() || existing?.artwork_url?.trim() || null,
    cached_at: now,
    lookup_attempted_at: lookupAttemptedAt,
    essentia_attempted_at: essentiaAttemptedAt,
  };
  if (canWriteReleaseDate()) {
    row.release_date = track.release_date?.trim() || existing?.release_date || null;
  }

  try {
    if (!incomingHasUsable) {
      const { error } = await supabase.from("tracks_cache").insert(row);
      if (error) {
        if (error.code === "23505") {
          console.log("[tracks-cache] Negative insert skipped; row already exists:", {
            spotifyId: track.spotify_id,
          });
          return;
        }
        if (noteMissingReleaseDateColumn(error.message)) {
          return saveCachedTrackAnalysis(track, analysis, options);
        }
        console.warn("[tracks-cache] Save failed:", {
          spotifyId: track.spotify_id,
          message: error.message,
        });
        return;
      }
      console.log("[tracks-cache] Saved:", {
        spotifyId: track.spotify_id,
        bpm: row.bpm,
        key: row.musical_key,
        genres: Array.isArray(row.genres) ? row.genres.length : 0,
        lookupAttemptedAt,
        essentiaAttemptedAt,
      });
      return;
    }

    const { error } = await supabase.from("tracks_cache").upsert(row, {
      onConflict: "spotify_id",
    });

    if (error) {
      if (noteMissingReleaseDateColumn(error.message)) {
        return saveCachedTrackAnalysis(track, analysis, options);
      }
      console.warn("[tracks-cache] Save failed:", {
        spotifyId: track.spotify_id,
        message: error.message,
      });
      return;
    }

    console.log("[tracks-cache] Saved:", {
      spotifyId: track.spotify_id,
      bpm: row.bpm,
      key: row.musical_key,
      genres: Array.isArray(row.genres) ? row.genres.length : 0,
      lookupAttemptedAt,
      essentiaAttemptedAt,
    });
  } catch (err) {
    console.warn("[tracks-cache] Save error:", err);
  }
}
