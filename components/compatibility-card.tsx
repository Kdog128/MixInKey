"use client";

import {
  CamelotKey,
  KeyCompatibility,
  getBpmCompatibility,
  getDurationCompatibility,
  getGenreCompatibility,
  getPopularityCompatibility,
  getOverallCompatibilityFromTrackData,
} from "@/lib/camelot";
import { CamelotWheel } from "@/components/camelot-wheel";
import { TrackResult } from "@/components/track-search";
import { cn } from "@/lib/utils";
import { Zap, Music2, Activity, Clock, Tag, TrendingUp, AlertCircle } from "lucide-react";

export interface AudioFeatures {
  popularity: number;
  duration_ms: number;
  explicit: boolean;
  genres: string[];
  estimatedBpm: number | null;
  // Always null — deprecated by Spotify in 2024
  tempo: null;
  key: null;
  mode: null;
  energy: null;
  danceability: null;
  valence: null;
}

interface CompatibilityCardProps {
  trackA: TrackResult;
  trackB: TrackResult;
  featuresA: AudioFeatures;
  featuresB: AudioFeatures;
  camelotA: CamelotKey | null;
  camelotB: CamelotKey | null;
  keyCompat: KeyCompatibility | null;
}

// ─── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 140 }: { score: number; size?: number }) {
  const r = (size - 20) / 2;
  const circ = 2 * Math.PI * r;
  const progress = (score / 100) * circ;
  const color =
    score >= 80 ? "#a855f7" :
    score >= 60 ? "#3b82f6" :
    score >= 40 ? "#f59e0b" :
    "#ef4444";
  const label =
    score >= 80 ? "Highly Compatible" :
    score >= 60 ? "Compatible" :
    score >= 40 ? "Borderline" : "Incompatible";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth="10"
            strokeDasharray={`${progress} ${circ}`}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: "stroke-dasharray 1s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums" style={{ color }}>{score}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className="text-sm font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

// ─── Stat Row ─────────────────────────────────────────────────────────────────

function StatRow({
  label,
  icon: Icon,
  score,
  valueA,
  valueB,
}: {
  label: string;
  icon: React.ElementType;
  score: number;
  valueA: React.ReactNode;
  valueB: React.ReactNode;
}) {
  const compatible = score >= 70;
  const neutral = score >= 50 && score < 70;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" />
          <span>{label}</span>
        </div>
        <div className={cn(
          "text-xs px-2 py-0.5 rounded-full border font-medium",
          compatible
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            : neutral
            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
            : "bg-red-500/10 text-red-400 border-red-500/20"
        )}>
          {compatible ? "Compatible" : neutral ? "Moderate" : "Divergent"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* Track A */}
        <div className="flex-1 flex items-center gap-2 justify-end">
          <span className="text-xs font-mono text-[#c084fc] truncate max-w-[120px] text-right">{valueA}</span>
        </div>
        {/* Bar pair */}
        <div className="w-24 h-1.5 rounded-full bg-white/5 overflow-hidden relative">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${score}%`,
              background: compatible ? "#10b981" : neutral ? "#f59e0b" : "#ef4444",
              boxShadow: `0 0 4px ${compatible ? "#10b981" : neutral ? "#f59e0b" : "#ef4444"}`,
              transition: "width 0.8s ease",
            }}
          />
        </div>
        {/* Track B */}
        <div className="flex-1 flex items-center gap-2">
          <span className="text-xs font-mono text-[#93c5fd] truncate max-w-[120px]">{valueB}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CompatibilityCard({
  trackA,
  trackB,
  featuresA,
  featuresB,
  camelotA,
  camelotB,
  keyCompat,
}: CompatibilityCardProps) {
  const bpmA = featuresA.estimatedBpm;
  const bpmB = featuresB.estimatedBpm;
  const bpmScore = (bpmA != null && bpmB != null) ? getBpmCompatibility(bpmA, bpmB) : null;
  const durScore = getDurationCompatibility(featuresA.duration_ms, featuresB.duration_ms);
  const genreScore = getGenreCompatibility(featuresA.genres, featuresB.genres);
  const popScore = getPopularityCompatibility(featuresA.popularity, featuresB.popularity);

  const overallScore = getOverallCompatibilityFromTrackData(
    featuresA.popularity, featuresB.popularity,
    featuresA.duration_ms, featuresB.duration_ms,
    featuresA.genres, featuresB.genres,
    bpmA, bpmB,
  );

  function formatDuration(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  const durDiff = Math.abs(featuresA.duration_ms - featuresB.duration_ms);
  const durClose = durDiff < 30_000;

  return (
    <div className="flex flex-col gap-6">

      {/* Track header cards */}
      <div className="grid grid-cols-2 gap-3">
        {([
          { track: trackA, color: "#a855f7" },
          { track: trackB, color: "#3b82f6" },
        ] as const).map(({ track, color }) => (
          <div
            key={track.id}
            className="flex items-center gap-3 p-3 rounded-xl border bg-surface-raised"
            style={{ borderColor: `${color}30` }}
          >
            {track.image ? (
              <img src={track.image} alt={track.album} className="size-10 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="size-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <Music2 className="size-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold truncate" style={{ color }}>{track.name}</p>
              <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Audio features deprecation notice */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <AlertCircle className="size-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300/80 leading-relaxed">
          <span className="font-semibold text-amber-300">BPM and key analysis unavailable.</span>{" "}
          Spotify deprecated the Audio Features API in 2024. BPM estimates below are derived from artist genre tags. For precise BPM and key, use a dedicated tool like Rekordbox or Mixed In Key.
        </p>
      </div>

      {/* Score + Camelot wheel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div className="flex flex-col items-center gap-4">
          <ScoreRing score={overallScore} size={160} />
          <p className="text-xs text-muted-foreground text-center text-pretty max-w-[220px]">
            Weighted: popularity (35%), duration (25%), genre (25%){bpmA != null && bpmB != null ? ", est. BPM (15%)" : ""}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <CamelotWheel keyA={null} keyB={null} />
          <p className="text-xs text-center text-muted-foreground/50 italic">
            Key data unavailable — Camelot wheel shown for reference
          </p>
        </div>
      </div>

      {/* Stats panel */}
      <div className="rounded-xl border border-border bg-surface-raised p-4 flex flex-col gap-5">
        <div className="flex items-center gap-2 text-sm font-semibold border-b border-border/50 pb-3">
          <Activity className="size-4 text-muted-foreground" />
          <span>Track Comparison</span>
          <div className="ml-auto flex gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-full bg-[#a855f7]" />Track 1
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-full bg-[#3b82f6]" />Track 2
            </div>
          </div>
        </div>

        <StatRow
          label="Popularity"
          icon={TrendingUp}
          score={popScore}
          valueA={`${featuresA.popularity}/100`}
          valueB={`${featuresB.popularity}/100`}
        />

        <StatRow
          label="Duration"
          icon={Clock}
          score={durScore}
          valueA={formatDuration(featuresA.duration_ms)}
          valueB={formatDuration(featuresB.duration_ms)}
        />

        <StatRow
          label="Genre Match"
          icon={Tag}
          score={genreScore}
          valueA={featuresA.genres.slice(0, 2).join(", ") || "Unknown"}
          valueB={featuresB.genres.slice(0, 2).join(", ") || "Unknown"}
        />

        {bpmA != null && bpmB != null && (
          <StatRow
            label="Est. BPM (genre-derived)"
            icon={Zap}
            score={bpmScore ?? 60}
            valueA={`~${bpmA} BPM`}
            valueB={`~${bpmB} BPM`}
          />
        )}
      </div>

      {/* Duration detail */}
      <div className="rounded-xl border border-border bg-surface-raised px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          <span>Duration difference</span>
        </div>
        <span className={cn(
          "text-xs font-mono font-semibold px-2 py-0.5 rounded-full border",
          durClose
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
        )}>
          {durClose
            ? `${Math.round(durDiff / 1000)}s apart`
            : `${Math.floor(durDiff / 60000)}m ${Math.round((durDiff % 60000) / 1000)}s apart`}
        </span>
      </div>

    </div>
  );
}
