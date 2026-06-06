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
