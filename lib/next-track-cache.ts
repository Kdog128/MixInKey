import {
  getBpmCompatibility,
  getKeyCompatibility,
  parseMusicalKeyString,
  type CamelotKey,
  type KeyCompatibility,
} from "@/lib/camelot";
import {
  getCachedTracksWithBpmAndKey,
  type TracksCacheRow,
} from "@/lib/tracks-cache";

export const CACHE_POOL_LIMIT = 12;
export const FAVORITE_RECS_PER_SEED = 3;

export interface CacheNextTrackInput {
  spotify_id: string;
  camelot: string;
  bpm: number;
}

export interface CacheNextTrackResult {
  spotify_id: string;
  name: string;
  artist: string;
  image: string | null;
  bpm: number | null;
  camelot: string;
  compatibility: KeyCompatibility;
}

interface ScoredCandidate extends CacheNextTrackResult {
  sortScore: number;
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

export function rankNextTracksFromCacheRows(
  track2: CacheNextTrackInput,
  track2Key: CamelotKey,
  rows: TracksCacheRow[],
  excludeIds: Set<string>,
  limit: number
): CacheNextTrackResult[] {
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
    .slice(0, limit)
    .map(({ sortScore: _sortScore, ...track }) => track);
}

export async function findNextTracksFromCache(
  track2: CacheNextTrackInput,
  track2Key: CamelotKey,
  excludeIds: Set<string>,
  limit = CACHE_POOL_LIMIT
): Promise<CacheNextTrackResult[]> {
  const rows = await getCachedTracksWithBpmAndKey();
  return rankNextTracksFromCacheRows(track2, track2Key, rows, excludeIds, limit);
}
