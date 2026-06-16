"use client";

import {
  CamelotKey,
  getBpmCompatibility,
  getDurationCompatibility,
  getGenreCompatibility,
  getKeyCompatibility,
  getKeyCompatStyle,
  getPopularityCompatibility,
  getReleaseDateCompatibility,
  getMixingTip,
  getOverallCompatibilityFromTrackData,
} from "@/lib/camelot";
import { CamelotWheel } from "@/components/camelot-wheel";
import { cn } from "@/lib/utils";
import { Activity, Clock, Tag, TrendingUp, Calendar, Zap, KeyRound, Lightbulb, ListPlus } from "lucide-react";

export type AudioAnalysisSource = "reccobeats" | "getsongbpm" | "soundnet" | "musicbrainz" | null;

export interface TrackFeatures {
  popularity: number;
  duration_ms: number;
  explicit: boolean;
  genres: string[];
  release_date: string | null;
  bpm: number | null;
  musical_key: string | null;
  camelot: CamelotKey | null;
  source: AudioAnalysisSource;
}

interface CompatibilityCardProps {
  featuresA: TrackFeatures;
  featuresB: TrackFeatures;
  onAddToSetA?: () => void;
  onAddToSetB?: () => void;
}

function getScoreStyle(score: number): { color: string; label: string } {
  if (score >= 90) return { color: "#15803d", label: "Highly Compatible" };
  if (score >= 70) return { color: "#22c55e", label: "Compatible" };
  if (score >= 50) return { color: "#eab308", label: "Moderate" };
  if (score >= 30) return { color: "#f97316", label: "Borderline" };
  return { color: "#ef4444", label: "Incompatible" };
}

// ─── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 140 }: { score: number; size?: number }) {
  const r = (size - 20) / 2;
  const circ = 2 * Math.PI * r;
  const progress = (score / 100) * circ;
  const { color, label } = getScoreStyle(score);

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
  badgeText,
  badgeStyle,
}: {
  label: string;
  icon: React.ElementType;
  score: number;
  valueA: React.ReactNode;
  valueB: React.ReactNode;
  badgeText?: string;
  badgeStyle?: { color: string; bg: string; border: string };
}) {
  const compatible = score >= 70;
  const neutral = score >= 50 && score < 70;
  const barColor = badgeStyle?.color ?? (compatible ? "#10b981" : neutral ? "#f59e0b" : "#ef4444");
  const badgeLabel = badgeText ?? (compatible ? "Compatible" : neutral ? "Moderate" : "Divergent");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" />
          <span>{label}</span>
        </div>
        {badgeStyle ? (
          <span
            className="text-xs px-2 py-0.5 rounded-full border font-medium"
            style={{
              color: badgeStyle.color,
              backgroundColor: badgeStyle.bg,
              borderColor: badgeStyle.border,
            }}
          >
            {badgeLabel}
          </span>
        ) : (
          <div className={cn(
            "text-xs px-2 py-0.5 rounded-full border font-medium",
            compatible
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : neutral
              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
              : "bg-red-500/10 text-red-400 border-red-500/20"
          )}>
            {badgeLabel}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 min-w-0 flex items-center gap-2 justify-end overflow-hidden">
          <span className="text-xs font-mono text-[#c084fc] truncate text-right w-full">{valueA}</span>
        </div>
        <div className="w-24 h-1.5 rounded-full bg-white/5 overflow-hidden relative flex-shrink-0">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${score}%`,
              background: barColor,
              boxShadow: `0 0 4px ${barColor}`,
              transition: "width 0.8s ease",
            }}
          />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
          <span className="text-xs font-mono text-[#93c5fd] truncate w-full">{valueB}</span>
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
  featuresA,
  featuresB,
  onAddToSetA,
  onAddToSetB,
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

  const mixingTip = keyCompat ? getMixingTip(keyCompat) : null;
  const keyCompatStyle = keyCompat ? getKeyCompatStyle(keyCompat.type) : null;

  return (
    <div className="flex flex-col gap-6">

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
          {keyCompat && keyCompatStyle && (
            <div
              className="rounded-xl border px-4 py-3 text-center"
              style={{
                backgroundColor: keyCompatStyle.bg,
                borderColor: keyCompatStyle.border,
              }}
            >
              <p className="text-sm font-semibold" style={{ color: keyCompatStyle.color }}>
                {keyCompat.label}
              </p>
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
          badgeText={keyCompat?.label}
          badgeStyle={keyCompatStyle ?? undefined}
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
          <div className="grid grid-cols-2 gap-3 text-xs min-w-0">
            <p className="text-[#c084fc] truncate min-w-0 overflow-hidden">{featuresA.genres.join(", ") || "—"}</p>
            <p className="text-[#93c5fd] truncate min-w-0 overflow-hidden">{featuresB.genres.join(", ") || "—"}</p>
          </div>
        </div>
      )}

      {/* Add to set */}
      {(onAddToSetA || onAddToSetB) && (
        <div className="rounded-xl border border-border bg-surface-raised px-4 py-3 flex flex-col gap-3">
          <p className="text-xs font-semibold text-muted-foreground">Set Planner</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {onAddToSetA && (
              <button
                type="button"
                onClick={onAddToSetA}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#a855f7]/30 bg-[#a855f7]/10 px-3 py-2 text-xs font-semibold text-[#c084fc] transition-colors hover:bg-[#a855f7]/20"
              >
                <ListPlus className="size-3.5" />
                Add Track 1 to Set
              </button>
            )}
            {onAddToSetB && (
              <button
                type="button"
                onClick={onAddToSetB}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-3 py-2 text-xs font-semibold text-[#93c5fd] transition-colors hover:bg-[#3b82f6]/20"
              >
                <ListPlus className="size-3.5" />
                Add Track 2 to Set
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mixing tip */}
      <div className="rounded-xl border border-border bg-surface-raised px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Lightbulb className="size-3.5" />
          <span>Mixing Tip</span>
        </div>
        <p
          className={cn("text-sm", !keyCompatStyle && "text-muted-foreground")}
          style={keyCompatStyle ? { color: keyCompatStyle.color } : undefined}
        >
          {mixingTip ?? "BPM and key data needed for a mixing tip."}
        </p>
      </div>

    </div>
  );
}
