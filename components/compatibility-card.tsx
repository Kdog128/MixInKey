"use client";

import { CamelotKey, KeyCompatibility, getBpmCompatibility, getOverallCompatibility } from "@/lib/camelot";
import { CamelotWheel } from "@/components/camelot-wheel";
import { TrackResult } from "@/components/track-search";
import { cn } from "@/lib/utils";
import { Zap, Music2, Activity, Footprints } from "lucide-react";

export interface AudioFeatures {
  tempo: number;
  key: number;
  mode: number;
  energy: number;
  danceability: number;
  valence: number;
  loudness: number;
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

function ScoreRing({
  score,
  size = 140,
}: {
  score: number;
  size?: number;
}) {
  const r = (size - 20) / 2;
  const circ = 2 * Math.PI * r;
  const progress = (score / 100) * circ;
  const color =
    score >= 80
      ? "#a855f7"
      : score >= 60
      ? "#3b82f6"
      : score >= 40
      ? "#f59e0b"
      : "#ef4444";
  const label =
    score >= 80 ? "Highly Compatible" :
    score >= 60 ? "Compatible" :
    score >= 40 ? "Borderline" : "Incompatible";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="10"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={`${progress} ${circ}`}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 8px ${color})`,
              transition: "stroke-dasharray 1s ease",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums" style={{ color }}>
            {score}
          </span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className="text-sm font-semibold" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

function StatBar({
  label,
  icon: Icon,
  valueA,
  valueB,
  formatFn,
}: {
  label: string;
  icon: React.ElementType;
  valueA: number;
  valueB: number;
  formatFn?: (v: number) => string;
}) {
  const fmt = formatFn ?? ((v: number) => `${Math.round(v * 100)}%`);
  const diff = Math.abs(valueA - valueB);
  const compatible = diff < 0.15;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" />
          <span>{label}</span>
        </div>
        <div
          className={cn(
            "text-xs px-2 py-0.5 rounded-full border font-medium",
            compatible
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
          )}
        >
          {compatible ? "Close" : `Δ ${fmt(diff)}`}
        </div>
      </div>
      <div className="flex gap-2 items-center">
        {/* Track A bar */}
        <div className="flex-1 flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#a855f7] shadow-[0_0_6px_#a855f7]"
              style={{ width: `${valueA * 100}%`, transition: "width 0.8s ease" }}
            />
          </div>
          <span className="text-xs font-mono text-muted-foreground w-10 text-right">{fmt(valueA)}</span>
        </div>
        <div className="w-px h-4 bg-border" />
        {/* Track B bar */}
        <div className="flex-1 flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground w-10">{fmt(valueB)}</span>
          <div className="h-2 flex-1 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#3b82f6] shadow-[0_0_6px_#3b82f6]"
              style={{ width: `${valueB * 100}%`, transition: "width 0.8s ease" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function KeyCompatBadge({ compat }: { compat: KeyCompatibility }) {
  const styles: Record<string, string> = {
    perfect: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    relative: "bg-[#a855f7]/15 text-[#c084fc] border-[#a855f7]/30",
    energy_boost: "bg-[#3b82f6]/15 text-[#93c5fd] border-[#3b82f6]/30",
    energy_drop: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    adjacent: "bg-teal-500/15 text-teal-300 border-teal-500/30",
    compatible: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    incompatible: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", styles[compat.type] ?? styles.compatible)}>
      {compat.label}
    </span>
  );
}

export function CompatibilityCard({
  trackA,
  trackB,
  featuresA,
  featuresB,
  camelotA,
  camelotB,
  keyCompat,
}: CompatibilityCardProps) {
  const bpmA = Math.round(featuresA.tempo);
  const bpmB = Math.round(featuresB.tempo);
  const bpmScore = getBpmCompatibility(bpmA, bpmB);
  const keyScore = keyCompat?.score ?? 0;
  const overallScore = getOverallCompatibility(
    keyScore,
    bpmScore,
    featuresA.energy,
    featuresB.energy,
    featuresA.danceability,
    featuresB.danceability
  );

  const bpmDiff = Math.abs(bpmA - bpmB);
  const bpmClose = bpmDiff <= 3;

  return (
    <div className="flex flex-col gap-6">
      {/* Header: both tracks */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { track: trackA, accent: "purple", color: "#a855f7" },
          { track: trackB, accent: "blue", color: "#3b82f6" },
        ].map(({ track, accent, color }) => (
          <div
            key={track.id}
            className="flex items-center gap-3 p-3 rounded-xl border bg-surface-raised"
            style={{ borderColor: `${color}30` }}
          >
            {track.image ? (
              <img
                src={track.image}
                alt={track.album}
                className="size-10 rounded-lg object-cover flex-shrink-0"
              />
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

      {/* Overall score + wheel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div className="flex flex-col items-center gap-4">
          <ScoreRing score={overallScore} size={160} />
          <p className="text-xs text-muted-foreground text-center text-pretty max-w-[220px]">
            Weighted score: key (35%), BPM (35%), energy (20%), danceability (10%)
          </p>
        </div>
        <CamelotWheel keyA={camelotA} keyB={camelotB} />
      </div>

      {/* Key & BPM row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Key */}
        <div className="rounded-xl border border-border bg-surface-raised p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Music2 className="size-4 text-muted-foreground" />
              <span>Musical Key</span>
            </div>
            {keyCompat && <KeyCompatBadge compat={keyCompat} />}
          </div>
          <div className="flex justify-between items-center">
            <div className="text-center">
              <div className="text-2xl font-bold text-[#a855f7] tabular-nums">
                {camelotA?.label ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">{camelotA?.musicalKey ?? "Unknown"}</div>
            </div>
            <div className="text-muted-foreground/40 text-sm">vs</div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[#3b82f6] tabular-nums">
                {camelotB?.label ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">{camelotB?.musicalKey ?? "Unknown"}</div>
            </div>
          </div>
          {keyCompat && (
            <p className="text-xs text-muted-foreground text-center border-t border-border/50 pt-2">
              {keyCompat.description}
            </p>
          )}
        </div>

        {/* BPM */}
        <div className="rounded-xl border border-border bg-surface-raised p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Zap className="size-4 text-muted-foreground" />
              <span>BPM</span>
            </div>
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full border font-semibold",
                bpmClose
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : bpmDiff <= 10
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/20"
              )}
            >
              {bpmClose ? "Matched" : `Δ ${bpmDiff} BPM`}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <div className="text-center">
              <div className="text-2xl font-bold text-[#a855f7] tabular-nums">{bpmA}</div>
              <div className="text-xs text-muted-foreground">BPM</div>
            </div>
            <div className="text-muted-foreground/40 text-sm">vs</div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[#3b82f6] tabular-nums">{bpmB}</div>
              <div className="text-xs text-muted-foreground">BPM</div>
            </div>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                bpmClose ? "bg-emerald-500" : bpmDiff <= 10 ? "bg-amber-500" : "bg-red-500"
              )}
              style={{ width: `${bpmScore}%` }}
            />
          </div>
        </div>
      </div>

      {/* Energy & Danceability */}
      <div className="rounded-xl border border-border bg-surface-raised p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold border-b border-border/50 pb-3">
          <Activity className="size-4 text-muted-foreground" />
          <span>Audio Profile</span>
          <div className="ml-auto flex gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-full bg-[#a855f7]" />Track 1
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-full bg-[#3b82f6]" />Track 2
            </div>
          </div>
        </div>
        <StatBar
          label="Energy"
          icon={Zap}
          valueA={featuresA.energy}
          valueB={featuresB.energy}
        />
        <StatBar
          label="Danceability"
          icon={Footprints}
          valueA={featuresA.danceability}
          valueB={featuresB.danceability}
        />
        <StatBar
          label="Valence (Mood)"
          icon={Activity}
          valueA={featuresA.valence}
          valueB={featuresB.valence}
        />
      </div>
    </div>
  );
}
