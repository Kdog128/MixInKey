// -- CREATE TABLE next_track_cache (cache_key text PRIMARY KEY, result jsonb NOT NULL, created_at timestamptz DEFAULT now());

import { NextRequest, NextResponse } from "next/server";
import {
  getBpmCompatibility,
  getKeyCompatibility,
  parseMusicalKeyString,
  type CamelotKey,
  type KeyCompatibility,
} from "@/lib/camelot";
import { fetchLastFmSimilarTracks } from "@/lib/lastfm";
import { fetchReccoBeatsBySpotifyIds } from "@/lib/reccobeats";
import { getSpotifyToken } from "@/lib/spotify-auth";
import { fetchSoundNetAnalysis } from "@/lib/soundnet";
import { mapSpotifyTrack, type SpotifyApiTrack } from "@/lib/spotify-track";
import { createSupabaseServerClient } from "@/lib/supabase";
import { resolveTrackMetadataByIds } from "@/lib/track-metadata";
import {
  getCachedTrackAnalysis,
  getCachedTracksAnalysis,
  getCachedTracksWithBpmAndKey,
} from "@/lib/tracks-cache";

interface Track2Input {
  spotify_id: string;
  camelot: string;
  bpm: number;
  name: string;
  artist: string;
}

interface NextTrackResult {
  spotify_id: string;
  name: string;
  artist: string;
  image: string | null;
  bpm: number | null;
  camelot: string;
  compatibility: KeyCompatibility;
}

interface NextTrackResponse {
  tracks: NextTrackResult[];
}

interface NextTrackCacheRow {
  cache_key: string;
  result: NextTrackResponse;
  created_at: string;
}

interface ScoredCandidate extends NextTrackResult {
  sortScore: number;
}

interface SpotifyCandidate {
  spotify_id: string;
  name: string;
  artist: string;
  image: string | null;
}

const CANDIDATE_LOOKUP_TIMEOUT_MS = 6000;
const MAX_PARALLEL_ANALYSIS = 3;
const LASTFM_SIMILAR_LIMIT = 50;
const CACHE_POOL_LIMIT = 12;
const NEXT_TRACK_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CandidateAnalysis {
  bpm: number | null;
  camelot: CamelotKey | null;
}

function hasKeyData(analysis: CandidateAnalysis): boolean {
  return analysis.camelot != null || analysis.bpm != null;
}

function isCacheFresh(createdAt: string): boolean {
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs < NEXT_TRACK_CACHE_TTL_MS;
}

async function getFreshNextTrackCache(cacheKey: string): Promise<NextTrackResponse | null> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("next_track_cache")
      .select("cache_key, result, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (error) {
      console.warn("[next-track] Cache read failed:", { cacheKey, message: error.message });
      return null;
    }

    if (!data) return null;

    const row = data as NextTrackCacheRow;
    if (!isCacheFresh(row.created_at)) {
      console.log("[next-track] Cache stale:", cacheKey);
      return null;
    }

    const result = row.result;
    if (!result || !Array.isArray(result.tracks) || result.tracks.length === 0) {
      return null;
    }

    console.log("[next-track] Cache hit:", cacheKey);
    return { tracks: result.tracks };
  } catch (err) {
    console.warn("[next-track] Cache read error:", err);
    return null;
  }
}

async function saveNextTrackCache(cacheKey: string, result: NextTrackResponse): Promise<void> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return;

  try {
    const { error } = await supabase.from("next_track_cache").upsert(
      {
        cache_key: cacheKey,
        result,
        created_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" }
    );

    if (error) {
      console.warn("[next-track] Cache save failed:", { cacheKey, message: error.message });
      return;
    }

    console.log("[next-track] Cache saved:", cacheKey);
  } catch (err) {
    console.warn("[next-track] Cache save error:", err);
  }
}

function parseTrack2Input(raw: unknown): Track2Input | null {
  if (!raw || typeof raw !== "object") return null;
  const track = raw as Record<string, unknown>;
  const spotifyId = typeof track.spotify_id === "string" ? track.spotify_id.trim() : "";
  const camelot = typeof track.camelot === "string" ? track.camelot.trim() : "";
  const bpm = typeof track.bpm === "number" && Number.isFinite(track.bpm) ? track.bpm : null;
  const name = typeof track.name === "string" ? track.name.trim() : "";
  const artist = typeof track.artist === "string" ? track.artist.trim() : "";

  if (!spotifyId || !camelot || bpm == null) {
    console.warn("[next-track] Invalid track2 input");
    return null;
  }

  return { spotify_id: spotifyId, camelot, bpm, name, artist };
}

async function lookupCandidateFromExternal(spotifyId: string): Promise<CandidateAnalysis> {
  const reccoMap = await fetchReccoBeatsBySpotifyIds([spotifyId]);
  const recco = reccoMap.get(spotifyId)?.analysis;
  if (recco && hasKeyData(recco)) {
    return { bpm: recco.bpm, camelot: recco.camelot };
  }

  const soundnet = await fetchSoundNetAnalysis(spotifyId);
  if (hasKeyData(soundnet)) {
    return { bpm: soundnet.bpm, camelot: soundnet.camelot };
  }

  return { bpm: null, camelot: null };
}

async function resolveCandidateAnalysis(spotifyId: string): Promise<CandidateAnalysis> {
  const cached = await getCachedTrackAnalysis(spotifyId);
  if (cached && hasKeyData(cached)) {
    return { bpm: cached.bpm, camelot: cached.camelot };
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timed = Promise.race([
    lookupCandidateFromExternal(spotifyId),
    new Promise<CandidateAnalysis>((resolve) => {
      timeoutId = setTimeout(
        () => resolve({ bpm: null, camelot: null }),
        CANDIDATE_LOOKUP_TIMEOUT_MS
      );
    }),
  ]);

  try {
    return await timed;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function searchSpotifyTrack(
  name: string,
  artist: string,
  headers: Record<string, string>
): Promise<SpotifyApiTrack | null> {
  const market = process.env.SPOTIFY_MARKET ?? "US";
  const q = `track:${name} artist:${artist}`;
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1&market=${encodeURIComponent(market)}`;

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json()) as { tracks?: { items?: SpotifyApiTrack[] } };
  return data.tracks?.items?.[0] ?? null;
}

async function resolveSimilarToSpotify(
  similar: Array<{ name: string; artist: string }>,
  excludeId: string,
  headers: Record<string, string>
): Promise<SpotifyCandidate[]> {
  const candidates: SpotifyCandidate[] = [];
  const seenIds = new Set<string>([excludeId]);

  await Promise.all(
    similar.map(async (item) => {
      const match = await searchSpotifyTrack(item.name, item.artist, headers);
      if (!match?.id || seenIds.has(match.id)) return;

      seenIds.add(match.id);
      const mapped = mapSpotifyTrack(match);
      candidates.push({
        spotify_id: mapped.id,
        name: mapped.name,
        artist: mapped.artist,
        image: mapped.image,
      });
    })
  );

  return candidates;
}

function toNextTrackResult(
  candidate: SpotifyCandidate,
  analysis: CandidateAnalysis,
  track2Key: CamelotKey
): ScoredCandidate | null {
  if (!analysis.camelot) return null;

  const compatibility = getKeyCompatibility(analysis.camelot, track2Key);
  if (compatibility.type === "incompatible") return null;

  return {
    spotify_id: candidate.spotify_id,
    name: candidate.name,
    artist: candidate.artist,
    image: candidate.image,
    bpm: analysis.bpm,
    camelot: analysis.camelot.label,
    compatibility,
    sortScore: compatibility.score,
  };
}

async function findNextTracks(
  track2: Track2Input,
  track2Key: CamelotKey,
  headers: Record<string, string>
): Promise<NextTrackResult[]> {
  const metadataById = await resolveTrackMetadataByIds([track2.spotify_id]);
  const track2Meta = metadataById.get(track2.spotify_id);
  const track2Name = track2.name || track2Meta?.name || "";
  const track2Artist = track2.artist || track2Meta?.artist || "";

  if (!track2Name || !track2Artist) {
    console.warn("[next-track] Missing track2 name/artist for Last.fm lookup");
    return [];
  }

  const similar = await fetchLastFmSimilarTracks(
    track2Name,
    track2Artist,
    LASTFM_SIMILAR_LIMIT
  );
  if (similar.length === 0) return [];

  const spotifyCandidates = await resolveSimilarToSpotify(
    similar,
    track2.spotify_id,
    headers
  );
  if (spotifyCandidates.length === 0) return [];

  const cacheMap = await getCachedTracksAnalysis(
    spotifyCandidates.map((candidate) => candidate.spotify_id)
  );

  const passing: ScoredCandidate[] = [];
  const needsAnalysis: SpotifyCandidate[] = [];

  for (const candidate of spotifyCandidates) {
    const cached = cacheMap.get(candidate.spotify_id);
    if (cached?.camelot) {
      const result = toNextTrackResult(
        candidate,
        { bpm: cached.bpm, camelot: cached.camelot },
        track2Key
      );
      if (result) passing.push(result);
      continue;
    }

    needsAnalysis.push(candidate);
  }

  for (let i = 0; i < needsAnalysis.length; i += MAX_PARALLEL_ANALYSIS) {
    if (passing.length >= 3) break;

    const batch = needsAnalysis.slice(i, i + MAX_PARALLEL_ANALYSIS);
    const analyzed = await Promise.all(
      batch.map(async (candidate) => ({
        candidate,
        analysis: await resolveCandidateAnalysis(candidate.spotify_id),
      }))
    );

    for (const { candidate, analysis } of analyzed) {
      const result = toNextTrackResult(candidate, analysis, track2Key);
      if (result) passing.push(result);
    }
  }

  return passing
    .sort((a, b) => b.sortScore - a.sortScore)
    .slice(0, 3)
    .map(({ sortScore: _sortScore, ...track }) => track);
}

function parseExcludeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ];
}

function mixScore(keyScore: number, bpmScore: number): number {
  return keyScore * 0.65 + bpmScore * 0.35;
}

function normalizeGenres(genres: string[] | null | undefined): string[] {
  if (!genres) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const genre of genres) {
    const key = genre.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
}

function genreOverlapCount(reference: string[], candidate: string[]): number {
  if (reference.length === 0 || candidate.length === 0) return 0;
  const refSet = new Set(reference);
  return candidate.filter((genre) => refSet.has(genre)).length;
}

/** Tiebreaker on mixScore. Unknown genre data ranks below a match but is not excluded. */
function genreTiebreaker(
  overlap: number,
  referenceHasGenres: boolean,
  candidateHasGenres: boolean
): number | "exclude" {
  if (referenceHasGenres && candidateHasGenres && overlap === 0) return "exclude";
  if (!referenceHasGenres) return 0;
  if (!candidateHasGenres) return -10;
  if (overlap >= 3) return 18;
  if (overlap === 2) return 14;
  return 8;
}

function parseReleaseYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null;
  return year;
}

/** Soft year-gap penalty. 20 years ≈ 15 points, so a much better key/BPM match is required. */
function yearPenalty(referenceYear: number | null, candidateYear: number | null): number {
  if (referenceYear == null || candidateYear == null) return 0;
  return Math.min(Math.abs(referenceYear - candidateYear), 40) * 0.75;
}

async function findNextTracksFromCache(
  track2: Track2Input,
  track2Key: CamelotKey,
  excludeIds: Set<string>
): Promise<NextTrackResult[]> {
  const rows = await getCachedTracksWithBpmAndKey();
  const reference = rows.find((row) => row.spotify_id === track2.spotify_id);
  const referenceGenres = normalizeGenres(reference?.genres);
  const referenceHasGenres = referenceGenres.length > 0;
  const referenceYear = parseReleaseYear(reference?.release_date);
  const passing: ScoredCandidate[] = [];

  for (const row of rows) {
    if (!row.spotify_id || excludeIds.has(row.spotify_id)) continue;
    if (row.spotify_id === track2.spotify_id) continue;
    if (row.bpm == null) continue;

    const camelot =
      parseMusicalKeyString(row.camelot_label ?? "") ??
      parseMusicalKeyString(row.musical_key ?? "");
    if (!camelot) continue;

    const compatibility = getKeyCompatibility(track2Key, camelot);
    if (compatibility.type === "incompatible") continue;

    const candidateGenres = normalizeGenres(row.genres);
    const overlap = genreOverlapCount(referenceGenres, candidateGenres);
    const genreAdj = genreTiebreaker(
      overlap,
      referenceHasGenres,
      candidateGenres.length > 0
    );
    if (genreAdj === "exclude") continue;

    const bpmScore = getBpmCompatibility(track2.bpm, row.bpm);
    passing.push({
      spotify_id: row.spotify_id,
      name: row.title?.trim() || "Unknown Track",
      artist: row.artist?.trim() || "Unknown Artist",
      image: row.artwork_url?.trim() || null,
      bpm: row.bpm,
      camelot: camelot.label,
      compatibility,
      sortScore:
        mixScore(compatibility.score, bpmScore) +
        genreAdj -
        yearPenalty(referenceYear, parseReleaseYear(row.release_date)),
    });
  }

  return passing
    .sort((a, b) => b.sortScore - a.sortScore)
    .slice(0, CACHE_POOL_LIMIT)
    .map(({ sortScore: _sortScore, ...track }) => track);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      track2?: unknown;
      pool?: unknown;
      exclude_spotify_ids?: unknown;
    };
    const track2 = parseTrack2Input(body.track2);

    if (!track2) {
      return NextResponse.json({ error: "Invalid track2 payload" }, { status: 400 });
    }

    const useCachePool = body.pool === "tracks_cache";
    const excludeIds = new Set(parseExcludeIds(body.exclude_spotify_ids));
    const cacheKey = track2.spotify_id;
    const bustCache = request.nextUrl.searchParams.get("bust") === "1";

    if (!useCachePool && !bustCache) {
      const cachedResult = await getFreshNextTrackCache(cacheKey);
      if (cachedResult) {
        return NextResponse.json(cachedResult);
      }
    }

    const track2Key = parseMusicalKeyString(track2.camelot);
    if (!track2Key) {
      return NextResponse.json({ error: "Invalid Camelot key" }, { status: 400 });
    }

    if (useCachePool) {
      const tracks = await findNextTracksFromCache(track2, track2Key, excludeIds);
      return NextResponse.json({ tracks });
    }

    const token = await getSpotifyToken();
    const headers = { Authorization: `Bearer ${token}` };

    const tracks = await findNextTracks(track2, track2Key, headers);

    if (tracks.length === 0) {
      return NextResponse.json({ tracks: [] });
    }

    const response: NextTrackResponse = { tracks };
    await saveNextTrackCache(cacheKey, response);
    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[next-track] Unhandled error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
