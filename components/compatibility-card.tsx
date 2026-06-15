"use client";

import {
  CamelotKey,
  getBpmCompatibility,
  getDurationCompatibility,
  getGenreCompatibility,
  getKeyCompatibility,
  getPopularityCompatibility,
  getReleaseDateCompatibility,
  getOverallCompatibilityFromTrackData,
} from "@/lib/camelot";
import { CamelotWheel } from "@/components/camelot-wheel";
import { TrackResult } from "@/components/track-search";
import { cn } from "@/lib/utils";
import { Activity, Clock, Tag, TrendingUp, Calendar, Music2, Zap, KeyRound } from "lucide-react";

export interface TrackFeatures {
  popularity: number;
  duration_ms: number;
  explicit: boolean;
  genres: string[];
  release_date: string | null;
  bpm: number | null;
  musical_key: string | null;
  camelot: CamelotKey | null;
}

interface CompatibilityCardProps {
  trackA: TrackResult;
  trackB: TrackResult;
  featuresA: TrackFeatures;
  featuresB: TrackFeatures;
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
        <div className="flex-1 flex items-center gap-2 justify-end">
          <span className="text-xs font-mono text-[#c084fc] truncate max-w-[120px] text-right">{valueA}</span>
        </div>
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
        <div className="flex-1 flex items-center gap-2">
          <span className="text-xs font-mono text-[#93c5fd] truncate max-w-[120px]">{valueB}</span>
        </div>
      </div>
    </div>
  );
}

function formatReleaseDate(date: string | null): string {
  if (!date) return "Unknown";
  if (date.length === 4) return date;
  const [year, month, day] = date.split("-");
  if (!month) return year;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = months[parseInt(month, 10) - 1];
  if (day && day !== "01") return `${m} ${parseInt(day, 10)}, ${year}`;
  return `${m} ${year}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CompatibilityCard({
  trackA,
  trackB,
  featuresA,
  featuresB,
}: CompatibilityCardProps) {
  const popScore = getPopularityCompatibility(featuresA.popularity, featuresB.popularity);
  const durScore = getDurationCompatibility(featuresA.duration_ms, featuresB.duration_ms);
  const genreScore = getGenreCompatibility(featuresA.genres, featuresB.genres);
  const releaseScore = getReleaseDateCompatibility(featuresA.release_date, featuresB.release_date);
  const bpmScore =
    featuresA.bpm != null && featuresB.bpm != null
      ? getBpmCompatibility(featuresA.bpm, featuresB.bpm)
      : null;
  const keyCompat =
    featuresA.camelot && featuresB.camelot
      ? getKeyCompatibility(featuresA.camelot, featuresB.camelot)
      : null;

  const overallScore = getOverallCompatibilityFromTrackData(
    featuresA.popularity, featuresB.popularity,
    featuresA.duration_ms, featuresB.duration_ms,
    featuresA.genres, featuresB.genres,
    featuresA.release_date, featuresB.release_date,
    featuresA.bpm, featuresB.bpm,
    keyCompat?.score ?? null,
  );

  const hasAudioAnalysis = Boolean(
    (featuresA.bpm != null && featuresB.bpm != null) ||
    (featuresA.camelot && featuresB.camelot)
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

      {/* Score + Camelot wheel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div className="flex flex-col items-center gap-4">
          <ScoreRing score={overallScore} size={160} />
          <p className="text-xs text-muted-foreground text-center text-pretty max-w-[240px]">
            {hasAudioAnalysis
              ? "Weighted: key (25%), BPM (25%), popularity (15%), duration (15%), genre (10%), release (10%)"
              : "Weighted: popularity (30%), duration (25%), genre (25%), release date (20%)"}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {featuresA.camelot && featuresB.camelot ? (
            <CamelotWheel keyA={featuresA.camelot} keyB={featuresB.camelot} />
          ) : (
            <CamelotWheel disabled comingSoonNote="BPM and key unavailable for one or both tracks" />
          )}
          {keyCompat && (
            <div className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-center">
              <p className="text-sm font-semibold text-foreground">{keyCompat.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{keyCompat.description}</p>
            </div>
          )}
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

        <StatRow
          label="Release Date"
          icon={Calendar}
          score={releaseScore}
          valueA={formatReleaseDate(featuresA.release_date)}
          valueB={formatReleaseDate(featuresB.release_date)}
        />

        <StatRow
          label="BPM"
          icon={Zap}
          score={bpmScore ?? 50}
          valueA={featuresA.bpm != null ? `${featuresA.bpm} BPM` : "Unavailable"}
          valueB={featuresB.bpm != null ? `${featuresB.bpm} BPM` : "Unavailable"}
        />

        <StatRow
          label="Musical Key"
          icon={KeyRound}
          score={keyCompat?.score ?? 50}
          valueA={
            featuresA.camelot
              ? `${featuresA.camelot.label} (${featuresA.camelot.musicalKey})`
              : "Unavailable"
          }
          valueB={
            featuresB.camelot
              ? `${featuresB.camelot.label} (${featuresB.camelot.musicalKey})`
              : "Unavailable"
          }
        />
      </div>

      {/* Genre detail */}
      {(featuresA.genres.length > 0 || featuresB.genres.length > 0) && (
        <div className="rounded-xl border border-border bg-surface-raised px-4 py-3 flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted-foreground">Artist Genres</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <p className="text-[#c084fc] truncate">{featuresA.genres.join(", ") || "—"}</p>
            <p className="text-[#93c5fd] truncate">{featuresB.genres.join(", ") || "—"}</p>
          </div>
        </div>
      )}

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
