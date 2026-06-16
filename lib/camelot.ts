// Spotify pitch class → Camelot notation
// Spotify key: 0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=A#, 11=B
// mode: 0=minor, 1=major

export interface CamelotKey {
  number: number; // 1–12
  letter: "A" | "B"; // A=minor, B=major
  label: string; // e.g. "8A"
  musicalKey: string; // e.g. "Am"
}

// Maps [pitch][mode] → camelot key info
const CAMELOT_MAP: Record<number, Record<number, CamelotKey>> = {
  0: { // C
    0: { number: 5, letter: "A", label: "5A", musicalKey: "Cm" },
    1: { number: 8, letter: "B", label: "8B", musicalKey: "C" },
  },
  1: { // C# / Db
    0: { number: 12, letter: "A", label: "12A", musicalKey: "C#m" },
    1: { number: 3, letter: "B", label: "3B", musicalKey: "Db" },
  },
  2: { // D
    0: { number: 7, letter: "A", label: "7A", musicalKey: "Dm" },
    1: { number: 10, letter: "B", label: "10B", musicalKey: "D" },
  },
  3: { // D# / Eb
    0: { number: 2, letter: "A", label: "2A", musicalKey: "Ebm" },
    1: { number: 5, letter: "B", label: "5B", musicalKey: "Eb" },
  },
  4: { // E
    0: { number: 9, letter: "A", label: "9A", musicalKey: "Em" },
    1: { number: 12, letter: "B", label: "12B", musicalKey: "E" },
  },
  5: { // F
    0: { number: 4, letter: "A", label: "4A", musicalKey: "Fm" },
    1: { number: 7, letter: "B", label: "7B", musicalKey: "F" },
  },
  6: { // F# / Gb
    0: { number: 11, letter: "A", label: "11A", musicalKey: "F#m" },
    1: { number: 2, letter: "B", label: "2B", musicalKey: "F#" },
  },
  7: { // G
    0: { number: 6, letter: "A", label: "6A", musicalKey: "Gm" },
    1: { number: 9, letter: "B", label: "9B", musicalKey: "G" },
  },
  8: { // G# / Ab
    0: { number: 1, letter: "A", label: "1A", musicalKey: "G#m" },
    1: { number: 4, letter: "B", label: "4B", musicalKey: "Ab" },
  },
  9: { // A
    0: { number: 8, letter: "A", label: "8A", musicalKey: "Am" },
    1: { number: 11, letter: "B", label: "11B", musicalKey: "A" },
  },
  10: { // A# / Bb
    0: { number: 3, letter: "A", label: "3A", musicalKey: "Bbm" },
    1: { number: 6, letter: "B", label: "6B", musicalKey: "Bb" },
  },
  11: { // B
    0: { number: 10, letter: "A", label: "10A", musicalKey: "Bm" },
    1: { number: 1, letter: "B", label: "1B", musicalKey: "B" },
  },
};

export function getCamelotKey(pitchClass: number, mode: number): CamelotKey | null {
  if (pitchClass < 0 || pitchClass > 11) return null;
  return CAMELOT_MAP[pitchClass]?.[mode] ?? null;
}

const NOTE_TO_PITCH: Record<string, number> = {
  c: 0, "c#": 1, db: 1, d: 2, "d#": 3, eb: 3, e: 4, f: 5,
  "f#": 6, gb: 6, g: 7, "g#": 8, ab: 8, a: 9, "a#": 10, bb: 10, b: 11,
};

/** Parse a musical key string (e.g. "8A", "F# minor", "Bb major") into Camelot notation. */
export function parseMusicalKeyString(keyStr: string): CamelotKey | null {
  const raw = keyStr.trim();
  if (!raw) return null;

  const camelotMatch = raw.match(/^(\d{1,2})\s*([ABab])$/);
  if (camelotMatch) {
    const number = parseInt(camelotMatch[1], 10);
    const letter = camelotMatch[2].toUpperCase() as "A" | "B";
    if (number >= 1 && number <= 12) {
      for (const pitch of Object.keys(CAMELOT_MAP).map(Number)) {
        for (const mode of [0, 1]) {
          const entry = CAMELOT_MAP[pitch]?.[mode];
          if (entry?.number === number && entry.letter === letter) return entry;
        }
      }
    }
  }

  const normalized = raw.toLowerCase().replace(/\s+/g, " ");
  const majorMinorMatch = normalized.match(/^([a-g](?:#|b)?)\s*(major|minor|maj|min|m)$/);
  if (majorMinorMatch) {
    const pitch = NOTE_TO_PITCH[majorMinorMatch[1]];
    if (pitch == null) return null;
    const modeToken = majorMinorMatch[2];
    const mode = modeToken === "major" || modeToken === "maj" ? 1 : 0;
    return getCamelotKey(pitch, mode);
  }

  const dashMatch = normalized.match(/^([a-g](?:#|b)?)-(major|minor)$/);
  if (dashMatch) {
    const pitch = NOTE_TO_PITCH[dashMatch[1]];
    if (pitch == null) return null;
    const mode = dashMatch[2] === "major" ? 1 : 0;
    return getCamelotKey(pitch, mode);
  }

  const compactMatch = normalized.match(/^([a-g](?:#|b)?)(m|min)?$/);
  if (compactMatch) {
    const pitch = NOTE_TO_PITCH[compactMatch[1]];
    if (pitch == null) return null;
    const mode = compactMatch[2] ? 0 : 1;
    return getCamelotKey(pitch, mode);
  }

  return null;
}

export type CompatibilityType =
  | "perfect" // same key
  | "energy_boost" // +1 semitone (number)
  | "energy_drop" // -1 semitone (number)
  | "relative" // A↔B same number
  | "adjacent" // ±1 number, same letter
  | "compatible"
  | "incompatible";

export interface KeyCompatibility {
  type: CompatibilityType;
  label: string;
  score: number; // 0–100
  description: string;
}

export function getKeyCompatibility(a: CamelotKey, b: CamelotKey): KeyCompatibility {
  if (a.label === b.label) {
    return { type: "perfect", label: "Perfect Match", score: 100, description: "Identical key — seamless mix" };
  }
  // Relative: same number, different letter
  if (a.number === b.number) {
    return { type: "relative", label: "Relative Key", score: 88, description: "Relative major/minor — highly compatible" };
  }
  // Adjacent: ±1 number, same letter
  const numDiff = ((b.number - a.number + 12) % 12);
  if (a.letter === b.letter && (numDiff === 1 || numDiff === 11)) {
    const label = numDiff === 1 ? "Energy Boost" : "Energy Drop";
    const type = numDiff === 1 ? "energy_boost" : "energy_drop";
    return { type, label, score: 80, description: "Adjacent key — smooth transition with energy shift" };
  }
  // Any adjacent (±1 number, different letter)
  if (numDiff === 1 || numDiff === 11) {
    return { type: "adjacent", label: "Adjacent Key", score: 65, description: "Close on the wheel — workable transition" };
  }
  // ±2 steps
  if (numDiff === 2 || numDiff === 10) {
    return { type: "compatible", label: "Compatible", score: 45, description: "Moderate harmonic distance — use with care" };
  }
  return { type: "incompatible", label: "Incompatible", score: 15, description: "Large harmonic distance — clashing keys" };
}

export interface KeyCompatStyle {
  color: string;
  bg: string;
  border: string;
}

/** UI colors for key compatibility labels — aligned with the score ring system. */
export function getKeyCompatStyle(type: CompatibilityType): KeyCompatStyle {
  switch (type) {
    case "perfect":
    case "relative":
    case "compatible":
      return {
        color: "#22c55e",
        bg: "rgba(34, 197, 94, 0.1)",
        border: "rgba(34, 197, 94, 0.2)",
      };
    case "adjacent":
    case "energy_boost":
    case "energy_drop":
      return {
        color: "#eab308",
        bg: "rgba(234, 179, 8, 0.1)",
        border: "rgba(234, 179, 8, 0.2)",
      };
    case "incompatible":
      return {
        color: "#ef4444",
        bg: "rgba(239, 68, 68, 0.1)",
        border: "rgba(239, 68, 68, 0.2)",
      };
  }
}

/** Short hover tooltip for mix compatibility badges in the Set Planner. */
export function getMixBadgeTooltip(type: CompatibilityType): string {
  switch (type) {
    case "perfect":
      return "Identical key — seamless mix";
    case "relative":
      return "Major/minor pair — highly compatible";
    case "energy_boost":
      return "One step clockwise on the Camelot wheel — adds energy";
    case "energy_drop":
      return "One step counter-clockwise — reduces energy";
    case "adjacent":
      return "One position away — smooth transition";
    case "compatible":
      return "Moderate harmonic distance — keep the transition brief";
    case "incompatible":
      return "Keys too far apart — use a transition track";
  }
}

export type BpmDirection = "rising" | "falling" | "steady" | "unknown";

export interface TransitionTrackInput {
  bpm: number | null;
  camelot_label: string | null;
  musical_key?: string | null;
}

export interface TransitionAnalysis {
  keyCompat: KeyCompatibility;
  bpmDirection: BpmDirection;
  energyLabel: string;
  tooltip: string;
}

const BPM_STEADY_THRESHOLD = 2;

function resolveTransitionCamelotKey(track: TransitionTrackInput): CamelotKey | null {
  if (track.camelot_label) {
    return parseMusicalKeyString(track.camelot_label);
  }
  if (track.musical_key) {
    return parseMusicalKeyString(track.musical_key);
  }
  return null;
}

/** BPM trend from track A into track B. Steady when within 2 BPM. */
export function getBpmDirection(
  bpmA: number | null,
  bpmB: number | null
): BpmDirection {
  if (bpmA == null || bpmB == null) return "unknown";
  const diff = bpmB - bpmA;
  if (Math.abs(diff) <= BPM_STEADY_THRESHOLD) return "steady";
  return diff > 0 ? "rising" : "falling";
}

function usesBpmEnergyLabel(type: CompatibilityType): boolean {
  return type === "perfect" || type === "relative" || type === "compatible";
}

function getCombinedEnergyLabel(
  keyCompat: KeyCompatibility,
  bpmDirection: BpmDirection
): string {
  if (keyCompat.type === "incompatible") {
    return keyCompat.label;
  }
  if (usesBpmEnergyLabel(keyCompat.type)) {
    if (bpmDirection === "rising") return "Building Energy";
    if (bpmDirection === "falling") return "Winding Down";
  }
  return keyCompat.label;
}

/** Combined key + BPM tooltip for Set Planner mix badges. */
export function getTransitionTooltip(analysis: Omit<TransitionAnalysis, "tooltip">): string {
  const { keyCompat, bpmDirection, energyLabel } = analysis;

  if (keyCompat.type === "incompatible") {
    return "Keys too far apart — use a transition track. BPM direction won't fix a clashing mix.";
  }

  if (energyLabel === "Building Energy") {
    const keyNote =
      keyCompat.type === "perfect"
        ? "Same Camelot key."
        : keyCompat.type === "relative"
          ? "Relative major/minor pair."
          : "Harmonically compatible keys.";
    return `${keyNote} BPM rises by more than 2 — builds energy into the next track.`;
  }

  if (energyLabel === "Winding Down") {
    const keyNote =
      keyCompat.type === "perfect"
        ? "Same Camelot key."
        : keyCompat.type === "relative"
          ? "Relative major/minor pair."
          : "Harmonically compatible keys.";
    return `${keyNote} BPM falls by more than 2 — eases energy into the next track.`;
  }

  const keyLine = getMixBadgeTooltip(keyCompat.type);

  if (bpmDirection === "unknown") {
    return keyLine;
  }

  const bpmLine =
    bpmDirection === "steady"
      ? "BPM stays within 2 — energy level holds."
      : bpmDirection === "rising"
        ? "BPM rises to the next track — adds pace."
        : "BPM drops to the next track — slows the groove.";

  return `${keyLine} ${bpmLine}`;
}

/** Key relationship + BPM direction between two consecutive set tracks. */
export function getTransitionAnalysis(
  trackA: TransitionTrackInput,
  trackB: TransitionTrackInput
): TransitionAnalysis | null {
  const keyA = resolveTransitionCamelotKey(trackA);
  const keyB = resolveTransitionCamelotKey(trackB);
  if (!keyA || !keyB) return null;

  const keyCompat = getKeyCompatibility(keyA, keyB);
  const bpmDirection = getBpmDirection(trackA.bpm, trackB.bpm);
  const energyLabel = getCombinedEnergyLabel(keyCompat, bpmDirection);

  const core = { keyCompat, bpmDirection, energyLabel };
  return {
    ...core,
    tooltip: getTransitionTooltip(core),
  };
}

/** DJ-facing mix advice from the Camelot relationship between two keys. */
export function getMixingTip(compat: KeyCompatibility): string {
  switch (compat.type) {
    case "perfect":
    case "relative":
      return "Direct mix — keys are harmonically compatible";
    case "energy_boost":
      return "Energy boost mix — step up one position on the wheel";
    case "energy_drop":
      return "Energy drop mix — step down one position on the wheel";
    case "adjacent":
      return "Adjacent mix — step one position on the wheel for a smooth handoff";
    case "compatible":
      return "Short overlap — keys are workable but keep the transition brief";
    case "incompatible":
      return "Use a transition track — keys are too far apart to mix directly";
  }
}

export function getBpmCompatibility(bpm1: number, bpm2: number): number {
  const ratio = Math.max(bpm1, bpm2) / Math.min(bpm1, bpm2);
  if (ratio <= 1.02) return 100;
  if (ratio <= 1.05) return 85;
  if (ratio <= 1.1) return 70;
  // Check if one is roughly double the other (halftime/doubletime)
  const halfRatio = Math.max(bpm1, bpm2) / (Math.min(bpm1, bpm2) * 2);
  if (halfRatio <= 1.05) return 60;
  if (ratio <= 1.2) return 50;
  if (ratio <= 1.3) return 30;
  return 10;
}

/** Score based on how similar two popularity values are (0–100 each). */
export function getPopularityCompatibility(pop1: number, pop2: number): number {
  const diff = Math.abs(pop1 - pop2); // 0–100
  if (diff <= 5) return 100;
  if (diff <= 15) return 85;
  if (diff <= 25) return 70;
  if (diff <= 40) return 50;
  if (diff <= 55) return 35;
  return 20;
}

/** Score based on duration difference. */
export function getDurationCompatibility(ms1: number, ms2: number): number {
  const diff = Math.abs(ms1 - ms2) / 1000; // seconds
  if (diff <= 15) return 100;
  if (diff <= 30) return 85;
  if (diff <= 60) return 70;
  if (diff <= 90) return 55;
  if (diff <= 120) return 40;
  return 25;
}

/** Score based on genre overlap (shared genre strings). */
export function getGenreCompatibility(genres1: string[], genres2: string[]): number {
  if (genres1.length === 0 && genres2.length === 0) return 60; // unknown = neutral
  if (genres1.length === 0 || genres2.length === 0) return 45;
  const set1 = new Set(genres1.map((g) => g.toLowerCase()));
  const shared = genres2.filter((g) => set1.has(g.toLowerCase())).length;
  if (shared >= 3) return 100;
  if (shared === 2) return 85;
  if (shared === 1) return 65;
  // No exact match — check for partial keyword overlap
  const keywords1 = genres1.join(" ").toLowerCase().split(/\s+/);
  const keywords2 = genres2.join(" ").toLowerCase().split(/\s+/);
  const kwSet = new Set(keywords1);
  const kwOverlap = keywords2.filter((w) => w.length > 3 && kwSet.has(w)).length;
  if (kwOverlap >= 2) return 55;
  if (kwOverlap === 1) return 42;
  return 20;
}

/** Score based on how close two release dates are. */
export function getReleaseDateCompatibility(date1: string | null, date2: string | null): number {
  if (!date1 || !date2) return 50;
  const y1 = parseInt(date1.slice(0, 4), 10);
  const y2 = parseInt(date2.slice(0, 4), 10);
  if (Number.isNaN(y1) || Number.isNaN(y2)) return 50;
  const yearDiff = Math.abs(y1 - y2);
  if (yearDiff === 0) return 100;
  if (yearDiff <= 2) return 85;
  if (yearDiff <= 5) return 70;
  if (yearDiff <= 10) return 55;
  return 35;
}

/** Overall score from Spotify metadata, optionally including BPM + key. */
export function getOverallCompatibilityFromTrackData(
  pop1: number, pop2: number,
  ms1: number, ms2: number,
  genres1: string[], genres2: string[],
  release1: string | null, release2: string | null,
  bpm1: number | null = null, bpm2: number | null = null,
  keyScore: number | null = null,
): number {
  const popScore = getPopularityCompatibility(pop1, pop2);
  const durScore = getDurationCompatibility(ms1, ms2);
  const genreScore = getGenreCompatibility(genres1, genres2);
  const releaseScore = getReleaseDateCompatibility(release1, release2);

  const hasBpm = bpm1 != null && bpm2 != null;
  const hasKey = keyScore != null;

  if (hasBpm && hasKey) {
    const bpmScore = getBpmCompatibility(bpm1, bpm2);
    return Math.round(
      keyScore * 0.25 +
      bpmScore * 0.25 +
      popScore * 0.15 +
      durScore * 0.15 +
      genreScore * 0.10 +
      releaseScore * 0.10
    );
  }

  if (hasBpm) {
    const bpmScore = getBpmCompatibility(bpm1, bpm2);
    return Math.round(
      bpmScore * 0.30 +
      popScore * 0.20 +
      durScore * 0.20 +
      genreScore * 0.15 +
      releaseScore * 0.15
    );
  }

  if (hasKey) {
    return Math.round(
      keyScore * 0.30 +
      popScore * 0.20 +
      durScore * 0.20 +
      genreScore * 0.15 +
      releaseScore * 0.15
    );
  }

  return Math.round(
    popScore * 0.30 +
    durScore * 0.25 +
    genreScore * 0.25 +
    releaseScore * 0.20
  );
}

/** Legacy function kept for future audio-features support. */
export function getOverallCompatibility(
  keyScore: number,
  bpmScore: number,
  energy1: number,
  energy2: number,
  danceability1: number,
  danceability2: number
): number {
  const energyDiff = Math.abs(energy1 - energy2); // 0–1
  const energyScore = Math.round((1 - energyDiff) * 100);
  const danceabilityDiff = Math.abs(danceability1 - danceability2);
  const danceabilityScore = Math.round((1 - danceabilityDiff) * 100);

  // Weighted: key 35%, bpm 35%, energy 20%, danceability 10%
  return Math.round(
    keyScore * 0.35 +
    bpmScore * 0.35 +
    energyScore * 0.20 +
    danceabilityScore * 0.10
  );
}
