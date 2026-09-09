import {
  getBpmCompatibility,
  getDurationCompatibility,
  getGenreCompatibility,
  getKeyCompatibility,
  getOverallCompatibilityFromAvailableFactors,
  getPopularityCompatibility,
  getReleaseDateCompatibility,
  parseMusicalKeyString,
  type CamelotKey,
  type OverallCompatibilityResult,
} from "@/lib/camelot";

export interface CompatibilityScoreInput {
  bpm: number | null;
  camelot: CamelotKey | null;
  popularity: number;
  duration_ms: number;
  genres: string[];
  release_date: string | null;
}

export function resolveCamelotKey(camelot: CamelotKey | null | undefined): CamelotKey | null {
  if (!camelot) return null;
  if (
    typeof camelot.number === "number" &&
    (camelot.letter === "A" || camelot.letter === "B") &&
    camelot.label
  ) {
    return camelot;
  }
  if (camelot.label) return parseMusicalKeyString(camelot.label);
  if (camelot.musicalKey) return parseMusicalKeyString(camelot.musicalKey);
  return null;
}

export function computeOverallCompatibility(
  featuresA: CompatibilityScoreInput,
  featuresB: CompatibilityScoreInput
): OverallCompatibilityResult | null {
  const camelotA = resolveCamelotKey(featuresA.camelot);
  const camelotB = resolveCamelotKey(featuresB.camelot);
  const hasBpm = featuresA.bpm != null && featuresB.bpm != null;
  const hasKey = Boolean(camelotA && camelotB);
  if (!hasBpm || !hasKey || !camelotA || !camelotB) return null;

  const hasPopularity = featuresA.popularity > 0 && featuresB.popularity > 0;
  const hasDuration = featuresA.duration_ms > 0 && featuresB.duration_ms > 0;
  const hasGenres = featuresA.genres.length > 0 && featuresB.genres.length > 0;
  const hasReleaseDate = Boolean(featuresA.release_date && featuresB.release_date);

  const bpmScore = getBpmCompatibility(featuresA.bpm!, featuresB.bpm!);
  const keyCompat = getKeyCompatibility(camelotA, camelotB);

  return getOverallCompatibilityFromAvailableFactors({
    keyScore: keyCompat.score,
    bpmScore,
    popularityScore: hasPopularity
      ? getPopularityCompatibility(featuresA.popularity, featuresB.popularity)
      : null,
    durationScore: hasDuration
      ? getDurationCompatibility(featuresA.duration_ms, featuresB.duration_ms)
      : null,
    genreScore: hasGenres
      ? getGenreCompatibility(featuresA.genres, featuresB.genres)
      : null,
    releaseScore: hasReleaseDate
      ? getReleaseDateCompatibility(featuresA.release_date, featuresB.release_date)
      : null,
  });
}

export function getCompatibilityScoreStyle(score: number): { color: string; label: string } {
  if (score >= 90) {
    return { color: "#15803d", label: "Highly Compatible" };
  }
  if (score >= 70) {
    return { color: "#22c55e", label: "Compatible" };
  }
  if (score >= 50) {
    return { color: "#eab308", label: "Moderate" };
  }
  if (score >= 30) {
    return { color: "#f97316", label: "Borderline" };
  }
  return { color: "#ef4444", label: "Incompatible" };
}
