/** Collapse rapid re-records of the same pair (e.g. Essentia refresh ~1 min later). */
export const COMPARISON_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

export function comparisonPairKey(id1: string, id2: string): string {
  const a = id1.trim();
  const b = id2.trim();
  if (!a || !b) return "";
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Rows must be newest-first. Keeps the latest row for a pair and drops older
 * copies that fall inside `windowMs` of the last kept row for that pair.
 */
export function dedupeComparisonHistory<
  T extends {
    track1_spotify_id: string;
    track2_spotify_id: string;
    compared_at: string;
  },
>(rows: T[], windowMs = COMPARISON_DEDUPE_WINDOW_MS): T[] {
  const lastKeptAt = new Map<string, number>();
  const kept: T[] = [];

  for (const row of rows) {
    const key = comparisonPairKey(row.track1_spotify_id, row.track2_spotify_id);
    if (!key) {
      kept.push(row);
      continue;
    }

    const comparedAt = Date.parse(row.compared_at);
    const previous = lastKeptAt.get(key);
    if (
      previous != null &&
      Number.isFinite(comparedAt) &&
      previous - comparedAt < windowMs
    ) {
      continue;
    }

    kept.push(row);
    if (Number.isFinite(comparedAt)) {
      lastKeptAt.set(key, comparedAt);
    }
  }

  return kept;
}
