"use client";

import { useEffect, useId, useState } from "react";
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
  getOverallCompatibilityFromAvailableFactors,
  COMPATIBILITY_FACTOR_TOTAL,
  getStatBadgeStyle,
  parseMusicalKeyString,
  type KeyCompatibility,
  type KeyCompatStyle,
} from "@/lib/camelot";
import { CamelotWheel } from "@/components/camelot-wheel";
import { SourceBadgesFooter } from "@/components/source-badges-footer";
import { COHESIVE_INNER_CARD_CLASS, cohesiveSurfaceStyle } from "@/lib/ui-surfaces";
import { cn } from "@/lib/utils";
import {
  Activity,
  Clock,
  Tag,
  TrendingUp,
  Calendar,
  Zap,
  KeyRound,
  Lightbulb,
  ListPlus,
  Info,
  GitBranch,
  Loader2,
  ArrowRight,
  Dices,
  Sparkles,
} from "lucide-react";

import type { AudioAnalysisSource } from "@/lib/audio-analysis";

export type { AudioAnalysisSource };

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
  needs_resolution?: boolean;
  needs_audio_analysis?: boolean;
}

interface CompatibilityCardProps {
  featuresA: TrackFeatures;
  featuresB: TrackFeatures;
  trackAId?: string;
  trackBId?: string;
  trackAName?: string;
  trackAArtist?: string;
  trackAImage?: string | null;
  trackBName?: string;
  trackBArtist?: string;
  trackBImage?: string | null;
  onAddToSetA?: () => void;
  onAddToSetB?: () => void;
}

interface BridgePathStep {
  spotify_id: string;
  name: string;
  artist: string;
  image: string | null;
  bpm: number;
  camelot: string;
  role: "start" | "bridge" | "end";
  fromPrevious: KeyCompatibility | null;
}

interface BridgeTracksResponse {
  type: "path" | "partial";
  complete: boolean;
  bpmTolerancePercent: 6 | 8 | 10;
  intermediateCount: number;
  path: BridgePathStep[];
  message: string;
}

const bridgeFetchInflight = new Map<string, Promise<BridgeTracksResponse>>();

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

const nextTrackFetchInflight = new Map<string, Promise<NextTrackResponse>>();

function isNextTrackCompatType(type: KeyCompatibility["type"] | undefined): boolean {
  return (
    type === "compatible" ||
    type === "perfect" ||
    type === "relative" ||
    type === "energy_boost" ||
    type === "energy_drop"
  );
}

async function fetchNextTracksOnce(
  requestKey: string,
  body: {
    track2: {
      spotify_id: string;
      camelot: string;
      bpm: number;
      name: string;
      artist: string;
    };
  },
  options?: { bust?: boolean }
): Promise<NextTrackResponse> {
  const bust = options?.bust ?? false;

  if (!bust) {
    const existing = nextTrackFetchInflight.get(requestKey);
    if (existing) return existing;
  }

  const promise = (async () => {
    const url = bust
      ? "/api/recommendations/next-track?bust=1"
      : "/api/recommendations/next-track";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error("Next track request failed");

    const data = (await res.json()) as NextTrackResponse;
    return { tracks: data.tracks ?? [] };
  })();

  if (bust) return promise;

  nextTrackFetchInflight.set(requestKey, promise);

  try {
    return await promise;
  } finally {
    nextTrackFetchInflight.delete(requestKey);
  }
}

async function fetchBridgeTracksOnce(
  requestKey: string,
  body: {
    track1: {
      spotify_id: string;
      camelot: string;
      bpm: number;
      name?: string;
      artist?: string;
      image?: string | null;
    };
    track2: {
      spotify_id: string;
      camelot: string;
      bpm: number;
      name?: string;
      artist?: string;
      image?: string | null;
    };
  },
  options?: { bust?: boolean }
): Promise<BridgeTracksResponse> {
  const bust = options?.bust ?? false;

  if (!bust) {
    const existing = bridgeFetchInflight.get(requestKey);
    if (existing) return existing;
  }

  const promise = (async () => {
    const url = bust
      ? "/api/recommendations/bridge?bust=1"
      : "/api/recommendations/bridge";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error("Bridge request failed");

    const data = (await res.json()) as BridgeTracksResponse;
    return {
      type: data.type === "partial" ? "partial" : "path",
      complete: Boolean(data.complete),
      bpmTolerancePercent: data.bpmTolerancePercent === 8 || data.bpmTolerancePercent === 10
        ? data.bpmTolerancePercent
        : 6,
      intermediateCount: data.intermediateCount ?? Math.max(0, (data.path?.length ?? 0) - 2),
      path: data.path ?? [],
      message: data.message ?? "",
    };
  })();

  if (bust) return promise;

  bridgeFetchInflight.set(requestKey, promise);

  try {
    return await promise;
  } finally {
    bridgeFetchInflight.delete(requestKey);
  }
}

function CompatBadge({ compat, prefix }: { compat: KeyCompatibility; prefix: string }) {
  const style = getKeyCompatStyle(compat.type);
  return (
    <span
      className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-tight"
      style={{
        color: style.color,
        backgroundColor: style.bg,
        borderColor: style.border,
      }}
    >
      {prefix}: {compat.label}
    </span>
  );
}

function BridgePathStepCard({
  step,
  label,
}: {
  step: BridgePathStep;
  label: string;
}) {
  const camelotKey = parseMusicalKeyString(step.camelot);
  const camelotStyle = camelotKey ? getKeyCompatStyle("compatible") : null;
  const isEndpoint = step.role === "start" || step.role === "end";

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-start gap-3 rounded-xl border bg-background/30 p-3",
        isEndpoint ? "border-border/70" : "border-border/50"
      )}
    >
      <div className="size-12 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
        {step.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={step.image} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full bg-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#a855f7]">
          {label}
        </p>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{step.name}</p>
          {step.artist ? (
            <p className="text-xs text-muted-foreground truncate">{step.artist}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-mono text-muted-foreground">
            {step.bpm} BPM
          </span>
          {camelotKey && camelotStyle && (
            <span
              className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold font-mono"
              style={{
                color: camelotStyle.color,
                backgroundColor: camelotStyle.bg,
                borderColor: camelotStyle.border,
              }}
            >
              {step.camelot}
            </span>
          )}
        </div>
        {step.fromPrevious && (
          <div className="flex flex-wrap gap-1.5">
            <CompatBadge compat={step.fromPrevious} prefix="From previous" />
          </div>
        )}
      </div>
    </div>
  );
}

function BridgePathConnector() {
  return (
    <div className="flex items-center justify-center px-1 py-1">
      <ArrowRight className="size-4 text-muted-foreground/80 rotate-90" />
    </div>
  );
}

function pathStepLabel(step: BridgePathStep, index: number, path: BridgePathStep[]): string {
  if (step.role === "start") return "Track 1";
  if (step.role === "end") return "Track 2";
  const isLast = index === path.length - 1;
  if (isLast) return "Closest so far";
  const bridgeIndex = path.slice(1, index).filter((item) => item.role === "bridge").length;
  return `Bridge ${String.fromCharCode(65 + bridgeIndex)}`;
}

function BridgeTracksSection({
  trackAId,
  trackBId,
  trackAName,
  trackAArtist,
  trackAImage,
  trackBName,
  trackBArtist,
  trackBImage,
  camelotA,
  camelotB,
  bpmA,
  bpmB,
}: {
  trackAId: string;
  trackBId: string;
  trackAName?: string;
  trackAArtist?: string;
  trackAImage?: string | null;
  trackBName?: string;
  trackBArtist?: string;
  trackBImage?: string | null;
  camelotA: CamelotKey;
  camelotB: CamelotKey;
  bpmA: number | null;
  bpmB: number | null;
}) {
  const [loading, setLoading] = useState(true);
  const [bridgeResponse, setBridgeResponse] = useState<BridgeTracksResponse | null>(null);

  const requestKey = `${trackAId}:${trackBId}:${camelotA.label}:${camelotB.label}:${bpmA ?? 0}:${bpmB ?? 0}`;
  const requestBody = {
    track1: {
      spotify_id: trackAId,
      camelot: camelotA.label,
      bpm: bpmA ?? 0,
      name: trackAName,
      artist: trackAArtist,
      image: trackAImage,
    },
    track2: {
      spotify_id: trackBId,
      camelot: camelotB.label,
      bpm: bpmB ?? 0,
      name: trackBName,
      artist: trackBArtist,
      image: trackBImage,
    },
  };

  useEffect(() => {
    let cancelled = false;

    async function loadInitialBridges() {
      setLoading(true);
      try {
        const results = await fetchBridgeTracksOnce(requestKey, requestBody);
        if (cancelled) return;
        setBridgeResponse(results);
      } catch {
        if (!cancelled) setBridgeResponse(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialBridges();
    return () => {
      cancelled = true;
    };
  }, [trackAId, trackBId, camelotA.label, camelotB.label, bpmA, bpmB]);

  const path = bridgeResponse?.path ?? [];
  const looserMatch = (bridgeResponse?.bpmTolerancePercent ?? 6) > 6;

  return (
    <div className={cn(COHESIVE_INNER_CARD_CLASS, "px-4 py-3 flex flex-col gap-3")} style={cohesiveSurfaceStyle()}>
      <div className="flex items-start gap-2.5">
        <GitBranch className="size-5 text-[#a855f7] flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-wide text-foreground">Bridge Tracks</h3>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-snug">
            {loading
              ? "Searching the cache for a mixable path…"
              : bridgeResponse?.message || "Play through this sequence to connect both tracks"}
          </p>
          {!loading && bridgeResponse && (
            <p className="text-[11px] mt-1 font-medium" style={{ color: looserMatch ? "#fbbf24" : "#c084fc" }}>
              {looserMatch
                ? `Looser match — ${bridgeResponse.bpmTolerancePercent}% BPM window`
                : `${bridgeResponse.bpmTolerancePercent}% BPM window`}
              {bridgeResponse.complete ? "" : " · partial path"}
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-[#a855f7]" />
          Finding bridge tracks…
        </div>
      ) : path.length === 0 ? (
        <p className="text-xs text-muted-foreground/70 text-center py-4">
          Couldn’t find a mixable path toward Track 2 in the cache.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-muted-foreground pb-2">
            {path.map((step, index) => (
              <span key={`${step.spotify_id}-${index}`} className="inline-flex items-center gap-1.5">
                {index > 0 && <ArrowRight className="size-3 shrink-0" />}
                <span
                  className={cn(
                    "font-semibold",
                    step.role === "start"
                      ? "text-[#c084fc]"
                      : step.role === "end"
                        ? "text-[#93c5fd]"
                        : "text-foreground"
                  )}
                >
                  {pathStepLabel(step, index, path)}
                </span>
              </span>
            ))}
          </div>
          {path.map((step, index) => (
            <div key={`${step.spotify_id}-${index}`}>
              {index > 0 && <BridgePathConnector />}
              <BridgePathStepCard step={step} label={pathStepLabel(step, index, path)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NextTrackCard({ track }: { track: NextTrackResult }) {
  const camelotKey = parseMusicalKeyString(track.camelot);
  const camelotStyle = camelotKey ? getKeyCompatStyle("compatible") : null;
  const compatStyle = getKeyCompatStyle(track.compatibility.type);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/30 p-3">
      <div className="size-12 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
        {track.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.image} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full bg-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{track.name}</p>
          <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {track.bpm != null && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {track.bpm} BPM
            </span>
          )}
          {camelotKey && camelotStyle && (
            <span
              className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold font-mono"
              style={{
                color: camelotStyle.color,
                backgroundColor: camelotStyle.bg,
                borderColor: camelotStyle.border,
              }}
            >
              {track.camelot}
            </span>
          )}
        </div>
        <span
          className="inline-flex w-fit items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-tight"
          style={{
            color: compatStyle.color,
            backgroundColor: compatStyle.bg,
            borderColor: compatStyle.border,
          }}
        >
          Track 2: {track.compatibility.label}
        </span>
      </div>
    </div>
  );
}

function NextTrackSection({
  trackBId,
  trackBName,
  trackBArtist,
  camelotB,
  bpmB,
}: {
  trackBId: string;
  trackBName?: string;
  trackBArtist?: string;
  camelotB: CamelotKey;
  bpmB: number | null;
}) {
  const [loading, setLoading] = useState(true);
  const [tracks, setTracks] = useState<NextTrackResult[]>([]);

  const requestKey = `${trackBId}:${camelotB.label}:${bpmB ?? 0}:${trackBName ?? ""}:${trackBArtist ?? ""}`;
  const requestBody = {
    track2: {
      spotify_id: trackBId,
      camelot: camelotB.label,
      bpm: bpmB ?? 0,
      name: trackBName ?? "",
      artist: trackBArtist ?? "",
    },
  };

  async function loadNextTracks(bust = false) {
    setLoading(true);
    try {
      const results = await fetchNextTracksOnce(requestKey, requestBody, { bust });
      setTracks(results.tracks);
    } catch {
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }

  function handleReroll() {
    void loadNextTracks(true);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialNextTracks() {
      setLoading(true);
      try {
        const results = await fetchNextTracksOnce(requestKey, requestBody);
        if (cancelled) return;
        setTracks(results.tracks);
      } catch {
        if (!cancelled) setTracks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialNextTracks();
    return () => {
      cancelled = true;
    };
  }, [trackBId, camelotB.label, bpmB, trackBName, trackBArtist]);

  return (
    <div className={cn(COHESIVE_INNER_CARD_CLASS, "px-4 py-3 flex flex-col gap-3")} style={cohesiveSurfaceStyle()}>
      <div className="flex items-start gap-2.5">
        <Sparkles className="size-5 text-[#a855f7] flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-foreground">What&apos;s Next</h3>
            <span className="group/next-reroll relative ml-auto inline-flex">
              <button
                type="button"
                onClick={handleReroll}
                disabled={loading}
                aria-label="Get different suggestions"
                className="inline-flex rounded-md p-1.5 text-muted-foreground transition-[color,filter] hover:text-white hover:drop-shadow-[0_0_8px_rgba(168,85,247,0.85)] disabled:pointer-events-none disabled:opacity-40 disabled:grayscale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a855f7]/50"
              >
                <Dices className="size-5" aria-hidden="true" />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute top-[calc(100%+6px)] right-0 z-50 w-max rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] text-popover-foreground shadow-lg opacity-0 invisible transition-opacity duration-150 group-hover/next-reroll:visible group-hover/next-reroll:opacity-100"
              >
                Get different suggestions
              </span>
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-snug">
            Tracks that flow well after Track 2
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-[#a855f7]" />
          Finding next tracks…
        </div>
      ) : tracks.length === 0 ? (
        <p className="text-xs text-muted-foreground/70 text-center py-4">
          No suggestions found
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {tracks.map((track) => (
            <NextTrackCard key={track.spotify_id} track={track} />
          ))}
        </div>
      )}
    </div>
  );
}

function getScoreStyle(score: number): { color: string; label: string } {
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

function resolveCamelotKey(camelot: CamelotKey | null | undefined): CamelotKey | null {
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

function getDefaultBadgeLabel(score: number): string {
  if (score >= 70) return "Compatible";
  if (score >= 50) return "Moderate";
  return "Divergent";
}

const SCORE_TOOLTIP_SHADOW =
  "shadow-[0_8px_24px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.35)]";

function ScoreWeightingTooltip({ text, id }: { text: string; id: string }) {
  return (
    <div
      id={id}
      role="tooltip"
      className={cn(
        "pointer-events-none absolute top-[calc(100%+10px)] right-0 z-[100]",
        "w-max max-w-[min(240px,calc(100vw-2rem))]",
        "opacity-0 transition-opacity duration-150",
        "group-hover/info:opacity-100 group-focus-within/info:opacity-100"
      )}
    >
      <div
        className={cn(
          "rounded-lg border border-white/10 bg-[#0f0f14] px-3 py-2",
          "text-[10px] leading-snug text-zinc-300 text-pretty",
          SCORE_TOOLTIP_SHADOW
        )}
      >
        {text}
      </div>
    </div>
  );
}

// ─── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({
  score,
  factorCount,
  size = 185,
}: {
  score: number;
  factorCount: number;
  size?: number;
}) {
  const glowFilterId = useId();
  const strokeWidth = size * 0.0625;
  const ringPadding = size * 0.125;
  const r = (size - ringPadding) / 2;
  const circ = 2 * Math.PI * r;
  const progress = (score / 100) * circ;
  const { color, label } = getScoreStyle(score);
  const cx = size / 2;
  const cy = size / 2;
  const glowPad = size * 0.0875;
  const blurStdDev = size * 0.022;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative max-w-full" style={{ width: size, height: size }}>
        <svg width={size} height={size} overflow="visible" aria-hidden="true" className="max-w-full h-auto">
          <defs>
            <filter
              id={glowFilterId}
              filterUnits="userSpaceOnUse"
              x={cx - r - glowPad}
              y={cy - r - glowPad}
              width={(r + glowPad) * 2}
              height={(r + glowPad) * 2}
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation={blurStdDev} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${progress} ${circ}`}
              strokeLinecap="round"
              filter={`url(#${glowFilterId})`}
              style={{ transition: "stroke-dasharray 1s ease" }}
            />
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-bold tabular-nums leading-none"
            style={{ color, fontSize: size * 0.1875 }}
          >
            {score}
          </span>
          <span
            className="text-muted-foreground"
            style={{ fontSize: size * 0.075, marginTop: size * 0.025 }}
          >
            / 100
          </span>
        </div>
      </div>
      <span className="text-[11px] text-muted-foreground">
        Scored on {factorCount} of {COMPATIBILITY_FACTOR_TOTAL} factors
      </span>
      <span className="text-sm font-semibold md:text-base" style={{ color }}>{label}</span>
    </div>
  );
}

function InsufficientScorePlaceholder({ size = 185 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex max-w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-7 text-center"
        style={{ width: size, height: size }}
      >
        <p className="text-sm leading-snug text-muted-foreground">
          Insufficient data for compatibility scoring
        </p>
      </div>
    </div>
  );
}

// ─── Stat Row ─────────────────────────────────────────────────────────────────

function CompatibilityBar({
  score,
  barColor,
  className,
}: {
  score: number;
  barColor: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative h-1.5 flex-shrink-0 overflow-hidden rounded-full bg-white/5 cursor-help",
        className
      )}
      title="Bar length reflects compatibility score, not the raw distance between values."
    >
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
  );
}

function StatRow({
  label,
  icon: Icon,
  score,
  valueA,
  valueB,
  badgeText,
  badgeStyle,
  valueRowClassName,
}: {
  label: string;
  icon: React.ElementType;
  score: number;
  valueA: React.ReactNode;
  valueB: React.ReactNode;
  badgeText?: string;
  badgeStyle?: KeyCompatStyle;
  valueRowClassName?: string;
}) {
  const resolvedBadgeStyle = badgeStyle ?? getStatBadgeStyle(score);
  const barColor = resolvedBadgeStyle.color;
  const badgeLabel = badgeText ?? getDefaultBadgeLabel(score);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        <span
          className="shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium"
          style={{
            color: resolvedBadgeStyle.color,
            backgroundColor: resolvedBadgeStyle.bg,
            borderColor: resolvedBadgeStyle.border,
          }}
        >
          {badgeLabel}
        </span>
      </div>
      <div className={cn("flex flex-col gap-1.5 md:hidden", valueRowClassName)}>
        <span className="text-xs font-mono text-[#c084fc] break-words">{valueA}</span>
        <CompatibilityBar score={score} barColor={barColor} className="w-full" />
        <span className="text-xs font-mono text-[#93c5fd] break-words">{valueB}</span>
      </div>
      <div className={cn("hidden min-w-0 items-center gap-2 md:flex", valueRowClassName)}>
        <div className="flex-1 min-w-0 flex items-center gap-2 justify-end overflow-hidden">
          <span className="text-xs font-mono text-[#c084fc] truncate text-right w-full">{valueA}</span>
        </div>
        <CompatibilityBar score={score} barColor={barColor} className="w-24" />
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
  trackAId,
  trackBId,
  trackAName,
  trackAArtist,
  trackAImage,
  trackBName,
  trackBArtist,
  trackBImage,
  onAddToSetA,
  onAddToSetB,
}: CompatibilityCardProps) {
  const camelotA = resolveCamelotKey(featuresA.camelot);
  const camelotB = resolveCamelotKey(featuresB.camelot);

  const hasBpm = featuresA.bpm != null && featuresB.bpm != null;
  const hasKey = Boolean(camelotA && camelotB);
  const hasCoreAnalysis = hasBpm && hasKey;

  const hasPopularity = featuresA.popularity > 0 && featuresB.popularity > 0;
  const hasDuration = featuresA.duration_ms > 0 && featuresB.duration_ms > 0;
  const hasGenres = featuresA.genres.length > 0 && featuresB.genres.length > 0;
  const hasReleaseDate = Boolean(featuresA.release_date && featuresB.release_date);

  const popScore = hasPopularity
    ? getPopularityCompatibility(featuresA.popularity, featuresB.popularity)
    : null;
  const durScore = hasDuration
    ? getDurationCompatibility(featuresA.duration_ms, featuresB.duration_ms)
    : null;
  const genreScore = hasGenres
    ? getGenreCompatibility(featuresA.genres, featuresB.genres)
    : null;
  const releaseScore = hasReleaseDate
    ? getReleaseDateCompatibility(featuresA.release_date, featuresB.release_date)
    : null;
  const bpmScore = hasBpm ? getBpmCompatibility(featuresA.bpm!, featuresB.bpm!) : null;
  const keyCompat = hasKey && camelotA && camelotB
    ? getKeyCompatibility(camelotA, camelotB)
    : null;

  const overall = hasCoreAnalysis && bpmScore != null && keyCompat
    ? getOverallCompatibilityFromAvailableFactors({
        keyScore: keyCompat.score,
        bpmScore,
        popularityScore: popScore,
        durationScore: durScore,
        genreScore,
        releaseScore,
      })
    : null;

  function formatDuration(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  const mixingTip = keyCompat ? getMixingTip(keyCompat) : null;
  const keyCompatStyle = keyCompat ? getKeyCompatStyle(keyCompat.type) : null;
  const bpmUnavailableNote =
    featuresA.needs_resolution || featuresB.needs_resolution
      ? "BPM unavailable — will resolve when Spotify rate limit clears"
      : "BPM and key unavailable for one or both tracks";

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-8">

      <div className="flex flex-wrap items-center gap-3 overflow-visible border-b border-border/50 pb-5">
        <div
          className="size-1.5 rounded-full"
          style={{
            background: "#a855f7",
            boxShadow: "0 0 6px #a855f7",
          }}
        />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-foreground">
          Compatibility Analysis
        </h2>
        <span className="group/info relative ml-auto inline-flex">
          <button
            type="button"
            aria-label="Score weighting breakdown"
            aria-describedby="compatibility-score-weighting"
            className="inline-flex rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a855f7]/50"
          >
            <Info className="size-3.5" />
          </button>
          <ScoreWeightingTooltip
            id="compatibility-score-weighting"
            text={
              overall?.weightingText ??
              "BPM and key are required to produce a compatibility score"
            }
          />
        </span>
      </div>

      {/* Score + Camelot wheel */}
      <div className="grid w-full min-w-0 grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div className="flex w-full max-w-full flex-col items-center">
          {overall ? (
            <ScoreRing score={overall.score} factorCount={overall.factorCount} size={185} />
          ) : (
            <InsufficientScorePlaceholder size={185} />
          )}
        </div>
        <div className="flex w-full max-w-full flex-col gap-3">
          {camelotA && camelotB ? (
            <CamelotWheel keyA={camelotA} keyB={camelotB} />
          ) : (
            <CamelotWheel disabled comingSoonNote={bpmUnavailableNote} />
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
              <p className="mt-1 text-xs" style={{ color: keyCompatStyle.color, opacity: 0.85 }}>
                {keyCompat.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stats panel */}
      <div className={cn(COHESIVE_INNER_CARD_CLASS, "p-4 flex flex-col gap-5")} style={cohesiveSurfaceStyle()}>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold border-b border-border/50 pb-3">
          <Activity className="size-4 text-muted-foreground" />
          <span>Track Comparison</span>
          <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-full bg-[#a855f7]" />
              <span className="text-[#c084fc]">Track 1</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-full bg-[#3b82f6]" />
              <span className="text-[#93c5fd]">Track 2</span>
            </div>
          </div>
        </div>

        {hasPopularity && popScore != null && (
          <StatRow
            label="Popularity"
            icon={TrendingUp}
            score={popScore}
            valueA={`${featuresA.popularity}/100`}
            valueB={`${featuresB.popularity}/100`}
          />
        )}

        {hasDuration && durScore != null && (
          <StatRow
            label="Duration"
            icon={Clock}
            score={durScore}
            valueA={formatDuration(featuresA.duration_ms)}
            valueB={formatDuration(featuresB.duration_ms)}
          />
        )}

        {hasGenres && genreScore != null && (
          <StatRow
            label="Genre Match"
            icon={Tag}
            score={genreScore}
            valueA={featuresA.genres.slice(0, 2).join(", ")}
            valueB={featuresB.genres.slice(0, 2).join(", ")}
            valueRowClassName="mt-0.5"
          />
        )}

        {hasReleaseDate && releaseScore != null && (
          <StatRow
            label="Release Date"
            icon={Calendar}
            score={releaseScore}
            valueA={formatReleaseDate(featuresA.release_date)}
            valueB={formatReleaseDate(featuresB.release_date)}
          />
        )}

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
          valueA={camelotA ? camelotA.label : "Unavailable"}
          valueB={camelotB ? camelotB.label : "Unavailable"}
        />
      </div>

      {/* Genre detail */}
      {(featuresA.genres.length > 0 || featuresB.genres.length > 0) && (
        <div className={cn(COHESIVE_INNER_CARD_CLASS, "px-4 py-3 flex flex-col gap-2")} style={cohesiveSurfaceStyle()}>
          <p className="text-xs font-semibold text-muted-foreground">Artist Genres</p>
          <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-1 items-center justify-start md:justify-center">
              <span className="group/genre-a relative inline-flex min-w-0 max-w-full justify-start md:justify-center">
                <p
                  className="min-w-0 max-w-full whitespace-normal break-words text-left text-xs text-[#c084fc] md:truncate md:whitespace-nowrap md:overflow-hidden md:text-ellipsis md:text-center"
                  title={featuresA.genres.join(", ")}
                >
                  {featuresA.genres.join(", ") || "—"}
                </p>
                {featuresA.genres.length > 0 && (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute top-[calc(100%+6px)] left-0 z-50 hidden w-max max-w-[min(15rem,calc(100vw-2rem))] -translate-x-0 rounded-md border border-border bg-popover px-2.5 py-1.5 text-center text-[11px] leading-snug text-popover-foreground shadow-lg opacity-0 invisible transition-opacity duration-150 md:block md:left-1/2 md:-translate-x-1/2 group-hover/genre-a:visible group-hover/genre-a:opacity-100"
                  >
                    {featuresA.genres.join(", ")}
                  </span>
                )}
              </span>
            </div>
            <div className="hidden w-24 flex-shrink-0 md:block" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 items-center justify-start md:justify-center">
              <span className="group/genre-b relative inline-flex min-w-0 max-w-full justify-start md:justify-center">
                <p
                  className="min-w-0 max-w-full whitespace-normal break-words text-left text-xs text-[#93c5fd] md:truncate md:whitespace-nowrap md:overflow-hidden md:text-ellipsis md:text-center"
                  title={featuresB.genres.join(", ")}
                >
                  {featuresB.genres.join(", ") || "—"}
                </p>
                {featuresB.genres.length > 0 && (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute top-[calc(100%+6px)] left-0 z-50 hidden w-max max-w-[min(15rem,calc(100vw-2rem))] rounded-md border border-border bg-popover px-2.5 py-1.5 text-center text-[11px] leading-snug text-popover-foreground shadow-lg opacity-0 invisible transition-opacity duration-150 md:block md:left-1/2 md:-translate-x-1/2 group-hover/genre-b:visible group-hover/genre-b:opacity-100"
                  >
                    {featuresB.genres.join(", ")}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Add to set */}
      {(onAddToSetA || onAddToSetB) && (
        <div className={cn(COHESIVE_INNER_CARD_CLASS, "px-4 py-3 flex flex-col gap-3")} style={cohesiveSurfaceStyle()}>
          <p className="text-xs font-semibold text-muted-foreground">Set Planner</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {onAddToSetA && (
              <button
                type="button"
                onClick={onAddToSetA}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#a855f7]/30 bg-[#a855f7]/10 px-3 py-2 text-xs font-semibold text-[#c084fc] transition-[colors,box-shadow,border-color] hover:border-[#a855f7]/50 hover:bg-[#a855f7]/20 hover:shadow-[0_0_16px_rgba(168,85,247,0.4)]"
              >
                <ListPlus className="size-3.5" />
                Add Track 1 to Set
              </button>
            )}
            {onAddToSetB && (
              <button
                type="button"
                onClick={onAddToSetB}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-3 py-2 text-xs font-semibold text-[#93c5fd] transition-[colors,box-shadow,border-color] hover:border-[#3b82f6]/50 hover:bg-[#3b82f6]/20 hover:shadow-[0_0_16px_rgba(59,130,246,0.4)]"
              >
                <ListPlus className="size-3.5" />
                Add Track 2 to Set
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mixing tip */}
      <div className={cn(COHESIVE_INNER_CARD_CLASS, "px-4 py-3 flex flex-col gap-2")} style={cohesiveSurfaceStyle()}>
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Lightbulb className="size-3.5" />
          <span>Mixing Tip</span>
        </div>
        <p
          className="text-sm"
          style={
            keyCompatStyle
              ? { color: keyCompatStyle.color }
              : { color: "oklch(0.55 0.04 265)" }
          }
        >
          {mixingTip ?? "BPM and key data needed for a mixing tip."}
        </p>
      </div>

      {(keyCompat?.type === "incompatible" || keyCompat?.type === "adjacent") &&
        camelotA &&
        camelotB &&
        trackAId &&
        trackBId && (
          <BridgeTracksSection
            trackAId={trackAId}
            trackBId={trackBId}
            trackAName={trackAName}
            trackAArtist={trackAArtist}
            trackAImage={trackAImage}
            trackBName={trackBName}
            trackBArtist={trackBArtist}
            trackBImage={trackBImage}
            camelotA={camelotA}
            camelotB={camelotB}
            bpmA={featuresA.bpm}
            bpmB={featuresB.bpm}
          />
        )}

      {isNextTrackCompatType(keyCompat?.type) &&
        camelotB &&
        trackBId && (
          <NextTrackSection
            trackBId={trackBId}
            trackBName={trackBName}
            trackBArtist={trackBArtist}
            camelotB={camelotB}
            bpmB={featuresB.bpm}
          />
        )}

      <div className={cn(COHESIVE_INNER_CARD_CLASS, "px-4 py-3")} style={cohesiveSurfaceStyle()}>
        <SourceBadgesFooter />
      </div>

    </div>
  );
}
