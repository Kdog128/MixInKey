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
  getOverallCompatibilityFromTrackData,
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
  Lock,
  LockOpen,
  GitBranch,
  Loader2,
  ArrowRight,
  Dices,
} from "lucide-react";

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
  trackAId?: string;
  trackBId?: string;
  onAddToSetA?: () => void;
  onAddToSetB?: () => void;
}

interface BridgeTrackResult {
  spotify_id: string;
  name: string;
  artist: string;
  image: string | null;
  bpm: number | null;
  camelot: string;
  compatWithTrack1: KeyCompatibility;
  compatWithTrack2: KeyCompatibility;
}

interface BridgeTracksResponse {
  type: "single" | "path";
  bridges: BridgeTrackResult[];
}

const bridgeFetchInflight = new Map<string, Promise<BridgeTracksResponse>>();

async function fetchBridgeTracksOnce(
  requestKey: string,
  body: {
    track1: { spotify_id: string; camelot: string; bpm: number };
    track2: { spotify_id: string; camelot: string; bpm: number };
  },
  options?: { bust?: boolean; lockedA?: string; lockedB?: string }
): Promise<BridgeTracksResponse> {
  const bust = options?.bust ?? false;
  const lockedA = options?.lockedA?.trim();
  const lockedB = options?.lockedB?.trim();

  if (!bust && !lockedA && !lockedB) {
    const existing = bridgeFetchInflight.get(requestKey);
    if (existing) return existing;
  }

  const promise = (async () => {
    const params = new URLSearchParams();
    if (bust) params.set("bust", "1");
    if (lockedA) params.set("locked_a", lockedA);
    if (lockedB) params.set("locked_b", lockedB);
    const query = params.toString();
    const url = query
      ? `/api/recommendations/bridge?${query}`
      : "/api/recommendations/bridge";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error("Bridge request failed");

    const data = (await res.json()) as BridgeTracksResponse;
    return {
      type: data.type ?? "single",
      bridges: data.bridges ?? [],
    };
  })();

  if (bust || lockedA || lockedB) return promise;

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

function BridgeTrackCard({
  bridge,
  label,
}: {
  bridge: BridgeTrackResult;
  label?: string;
}) {
  const camelotKey = parseMusicalKeyString(bridge.camelot);
  const camelotStyle = camelotKey ? getKeyCompatStyle("compatible") : null;

  return (
    <div className="flex min-w-0 flex-1 items-start gap-3 rounded-xl border border-border/50 bg-background/30 p-3">
      <div className="size-12 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
        {bridge.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bridge.image} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full bg-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        {label && (
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#a855f7]">
            {label}
          </p>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{bridge.name}</p>
          <p className="text-xs text-muted-foreground truncate">{bridge.artist}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {bridge.bpm != null && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {bridge.bpm} BPM
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
              {bridge.camelot}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CompatBadge compat={bridge.compatWithTrack1} prefix="Track 1" />
          <CompatBadge compat={bridge.compatWithTrack2} prefix="Track 2" />
        </div>
      </div>
    </div>
  );
}

function BridgePathTrackCard({
  bridge,
  label,
  locked,
  onToggleLock,
}: {
  bridge: BridgeTrackResult;
  label: string;
  locked: boolean;
  onToggleLock: () => void;
}) {
  const camelotKey = parseMusicalKeyString(bridge.camelot);
  const camelotStyle = camelotKey ? getKeyCompatStyle("compatible") : null;

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-1 items-start gap-3 rounded-xl border bg-background/30 p-3 pt-9",
        locked ? "border-[#a855f7]/45" : "border-border/50"
      )}
    >
      <button
        type="button"
        onClick={onToggleLock}
        aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
        aria-pressed={locked}
        className={cn(
          "absolute top-2 right-2 inline-flex rounded-md p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a855f7]/50",
          locked
            ? "text-[#a855f7]"
            : "text-muted-foreground hover:text-muted-foreground/90"
        )}
      >
        {locked ? (
          <Lock className="size-3.5" aria-hidden="true" />
        ) : (
          <LockOpen className="size-3.5" aria-hidden="true" />
        )}
      </button>
      <div className="size-12 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
        {bridge.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bridge.image} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full bg-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#a855f7]">
          {label}
        </p>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{bridge.name}</p>
          <p className="text-xs text-muted-foreground truncate">{bridge.artist}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {bridge.bpm != null && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {bridge.bpm} BPM
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
              {bridge.camelot}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CompatBadge compat={bridge.compatWithTrack1} prefix="Track 1" />
          <CompatBadge compat={bridge.compatWithTrack2} prefix="Track 2" />
        </div>
      </div>
    </div>
  );
}

function BridgePathConnector() {
  return (
    <div className="flex items-center justify-center px-1 py-1 sm:py-0">
      <ArrowRight className="size-4 text-muted-foreground/80 rotate-90 sm:rotate-0" />
    </div>
  );
}

function BridgeTracksSection({
  trackAId,
  trackBId,
  camelotA,
  camelotB,
  bpmA,
  bpmB,
}: {
  trackAId: string;
  trackBId: string;
  camelotA: CamelotKey;
  camelotB: CamelotKey;
  bpmA: number | null;
  bpmB: number | null;
}) {
  const [loading, setLoading] = useState(true);
  const [bridgeResponse, setBridgeResponse] = useState<BridgeTracksResponse>({
    type: "single",
    bridges: [],
  });
  const [lockedBridgeA, setLockedBridgeA] = useState(false);
  const [lockedBridgeB, setLockedBridgeB] = useState(false);

  const requestKey = `${trackAId}:${trackBId}:${camelotA.label}:${camelotB.label}:${bpmA ?? 0}:${bpmB ?? 0}`;
  const requestBody = {
    track1: {
      spotify_id: trackAId,
      camelot: camelotA.label,
      bpm: bpmA ?? 0,
    },
    track2: {
      spotify_id: trackBId,
      camelot: camelotB.label,
      bpm: bpmB ?? 0,
    },
  };

  async function loadBridges(
    bust = false,
    locks?: { lockedA?: string; lockedB?: string }
  ) {
    setLoading(true);
    try {
      const results = await fetchBridgeTracksOnce(requestKey, requestBody, {
        bust,
        lockedA: locks?.lockedA,
        lockedB: locks?.lockedB,
      });
      setBridgeResponse(results);
      if (results.type !== "path") {
        setLockedBridgeA(false);
        setLockedBridgeB(false);
      }
    } catch {
      setBridgeResponse({ type: "single", bridges: [] });
      setLockedBridgeA(false);
      setLockedBridgeB(false);
    } finally {
      setLoading(false);
    }
  }

  function handleReroll() {
    const { type, bridges } = bridgeResponse;

    if (type === "path" && bridges.length >= 2) {
      if (lockedBridgeA && lockedBridgeB) return;

      void loadBridges(true, {
        lockedA: lockedBridgeA ? bridges[0].spotify_id : undefined,
        lockedB: lockedBridgeB ? bridges[1].spotify_id : undefined,
      });
      return;
    }

    void loadBridges(true);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialBridges() {
      setLoading(true);
      try {
        const results = await fetchBridgeTracksOnce(requestKey, requestBody);
        if (cancelled) return;
        setBridgeResponse(results);
      } catch {
        if (!cancelled) setBridgeResponse({ type: "single", bridges: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialBridges();
    return () => {
      cancelled = true;
    };
  }, [trackAId, trackBId, camelotA.label, camelotB.label, bpmA, bpmB]);

  useEffect(() => {
    setLockedBridgeA(false);
    setLockedBridgeB(false);
  }, [trackAId, trackBId, camelotA.label, camelotB.label]);

  const { type, bridges } = bridgeResponse;
  const bothPathBridgesLocked =
    type === "path" && bridges.length >= 2 && lockedBridgeA && lockedBridgeB;

  return (
    <div className={cn(COHESIVE_INNER_CARD_CLASS, "px-4 py-3 flex flex-col gap-3")} style={cohesiveSurfaceStyle()}>
      <div className="flex items-start gap-2.5">
        <GitBranch className="size-5 text-[#a855f7] flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-foreground">Bridge Tracks</h3>
            <span className="group/reroll relative ml-auto inline-flex">
              <button
                type="button"
                onClick={handleReroll}
                disabled={loading || bothPathBridgesLocked}
                aria-label="Get different suggestions"
                className="inline-flex rounded-md p-1.5 text-muted-foreground transition-[color,filter] hover:text-white hover:drop-shadow-[0_0_8px_rgba(168,85,247,0.85)] disabled:pointer-events-none disabled:opacity-40 disabled:grayscale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a855f7]/50"
              >
                <Dices className="size-5" aria-hidden="true" />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute top-[calc(100%+6px)] right-0 z-50 w-max rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] text-popover-foreground shadow-lg opacity-0 invisible transition-opacity duration-150 group-hover/reroll:visible group-hover/reroll:opacity-100"
              >
                Get different suggestions
              </span>
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-snug">
            Tracks that connect both keys for a smoother mix transition
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-[#a855f7]" />
          Finding bridge tracks…
        </div>
      ) : bridges.length === 0 ? (
        <p className="text-xs text-muted-foreground/70 text-center py-4">
          No bridge tracks found
        </p>
      ) : type === "path" && bridges.length >= 2 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="font-semibold text-[#c084fc]">Track 1</span>
            <ArrowRight className="size-3 shrink-0" />
            <span className="font-semibold text-foreground">Bridge A</span>
            <ArrowRight className="size-3 shrink-0" />
            <span className="font-semibold text-foreground">Bridge B</span>
            <ArrowRight className="size-3 shrink-0" />
            <span className="font-semibold text-[#93c5fd]">Track 2</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-stretch gap-1 sm:gap-2">
            <BridgePathTrackCard
              bridge={bridges[0]}
              label="Bridge A"
              locked={lockedBridgeA}
              onToggleLock={() => setLockedBridgeA((value) => !value)}
            />
            <BridgePathConnector />
            <BridgePathTrackCard
              bridge={bridges[1]}
              label="Bridge B"
              locked={lockedBridgeB}
              onToggleLock={() => setLockedBridgeB((value) => !value)}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {bridges.map((bridge) => (
            <BridgeTrackCard key={bridge.spotify_id} bridge={bridge} />
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

const SCORE_WEIGHTING_WITH_AUDIO =
  "Weighted: key (25%), BPM (25%), popularity (15%), duration (15%), genre (10%), release (10%)";
const SCORE_WEIGHTING_WITHOUT_AUDIO =
  "Weighted: popularity (30%), duration (25%), genre (25%), release date (20%)";

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

function ScoreRing({ score, size = 185 }: { score: number; size?: number }) {
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
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} overflow="visible" aria-hidden="true">
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
      <span className="text-sm font-semibold md:text-base" style={{ color }}>{label}</span>
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" />
          <span>{label}</span>
        </div>
        <span
          className="rounded-full border px-2 py-0.5 text-xs font-medium"
          style={{
            color: resolvedBadgeStyle.color,
            backgroundColor: resolvedBadgeStyle.bg,
            borderColor: resolvedBadgeStyle.border,
          }}
        >
          {badgeLabel}
        </span>
      </div>
      <div className={cn("flex min-w-0 items-center gap-2", valueRowClassName)}>
        <div className="flex-1 min-w-0 flex items-center gap-2 justify-end overflow-hidden">
          <span className="text-xs font-mono text-[#c084fc] truncate text-right w-full">{valueA}</span>
        </div>
        <div
          className="w-24 h-1.5 rounded-full bg-white/5 overflow-hidden relative flex-shrink-0 cursor-help"
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
  onAddToSetA,
  onAddToSetB,
}: CompatibilityCardProps) {
  const camelotA = resolveCamelotKey(featuresA.camelot);
  const camelotB = resolveCamelotKey(featuresB.camelot);

  const popScore = getPopularityCompatibility(featuresA.popularity, featuresB.popularity);
  const durScore = getDurationCompatibility(featuresA.duration_ms, featuresB.duration_ms);
  const genreScore = getGenreCompatibility(featuresA.genres, featuresB.genres);
  const releaseScore = getReleaseDateCompatibility(featuresA.release_date, featuresB.release_date);
  const bpmScore =
    featuresA.bpm != null && featuresB.bpm != null
      ? getBpmCompatibility(featuresA.bpm, featuresB.bpm)
      : null;
  const keyCompat =
    camelotA && camelotB
      ? getKeyCompatibility(camelotA, camelotB)
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
    (camelotA && camelotB)
  );

  function formatDuration(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  const mixingTip = keyCompat ? getMixingTip(keyCompat) : null;
  const keyCompatStyle = keyCompat ? getKeyCompatStyle(keyCompat.type) : null;

  return (
    <div className="flex flex-col gap-8">

      <div className="flex items-center gap-3 overflow-visible border-b border-border/50 pb-5">
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
            text={hasAudioAnalysis ? SCORE_WEIGHTING_WITH_AUDIO : SCORE_WEIGHTING_WITHOUT_AUDIO}
          />
        </span>
      </div>

      {/* Score + Camelot wheel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div className="flex flex-col items-center">
          <ScoreRing score={overallScore} size={185} />
        </div>
        <div className="flex flex-col gap-3">
          {camelotA && camelotB ? (
            <CamelotWheel keyA={camelotA} keyB={camelotB} />
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
              <p className="mt-1 text-xs" style={{ color: keyCompatStyle.color, opacity: 0.85 }}>
                {keyCompat.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stats panel */}
      <div className={cn(COHESIVE_INNER_CARD_CLASS, "p-4 flex flex-col gap-5")} style={cohesiveSurfaceStyle()}>
        <div className="flex items-center gap-2 text-sm font-semibold border-b border-border/50 pb-3">
          <Activity className="size-4 text-muted-foreground" />
          <span>Track Comparison</span>
          <div className="ml-auto flex gap-4 text-xs">
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
          valueRowClassName="mt-0.5"
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
          valueA={camelotA ? camelotA.label : "Unavailable"}
          valueB={camelotB ? camelotB.label : "Unavailable"}
        />
      </div>

      {/* Genre detail */}
      {(featuresA.genres.length > 0 || featuresB.genres.length > 0) && (
        <div className={cn(COHESIVE_INNER_CARD_CLASS, "px-4 py-3 flex flex-col gap-2")} style={cohesiveSurfaceStyle()}>
          <p className="text-xs font-semibold text-muted-foreground">Artist Genres</p>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center justify-center">
              <span className="group/genre-a relative inline-flex min-w-0 max-w-full justify-center">
                <p
                  className="min-w-0 max-w-full truncate whitespace-nowrap overflow-hidden text-ellipsis text-center text-xs text-[#c084fc]"
                  title={featuresA.genres.join(", ")}
                >
                  {featuresA.genres.join(", ") || "—"}
                </p>
                {featuresA.genres.length > 0 && (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute top-[calc(100%+6px)] left-1/2 z-50 w-max max-w-[15rem] -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-center text-[11px] leading-snug text-popover-foreground shadow-lg opacity-0 invisible transition-opacity duration-150 group-hover/genre-a:visible group-hover/genre-a:opacity-100"
                  >
                    {featuresA.genres.join(", ")}
                  </span>
                )}
              </span>
            </div>
            <div className="w-24 flex-shrink-0" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 items-center justify-center">
              <span className="group/genre-b relative inline-flex min-w-0 max-w-full justify-center">
                <p
                  className="min-w-0 max-w-full truncate whitespace-nowrap overflow-hidden text-ellipsis text-center text-xs text-[#93c5fd]"
                  title={featuresB.genres.join(", ")}
                >
                  {featuresB.genres.join(", ") || "—"}
                </p>
                {featuresB.genres.length > 0 && (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute top-[calc(100%+6px)] left-1/2 z-50 w-max max-w-[15rem] -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-center text-[11px] leading-snug text-popover-foreground shadow-lg opacity-0 invisible transition-opacity duration-150 group-hover/genre-b:visible group-hover/genre-b:opacity-100"
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
            camelotA={camelotA}
            camelotB={camelotB}
            bpmA={featuresA.bpm}
            bpmB={featuresB.bpm}
          />
        )}

      <div className={cn(COHESIVE_INNER_CARD_CLASS, "px-4 py-3")} style={cohesiveSurfaceStyle()}>
        <SourceBadgesFooter />
      </div>

    </div>
  );
}
