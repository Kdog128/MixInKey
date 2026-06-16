"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Activity, CircleHelp, Music } from "lucide-react";
import type { SetlistTrack } from "@/lib/setlist";
import {
  getKeyCompatStyle,
  getTransitionAnalysis,
  type CompatibilityType,
} from "@/lib/camelot";
import { cn } from "@/lib/utils";

interface EnergyArcProps {
  tracks: SetlistTrack[];
  onBpmChange: (trackIndex: number, newBpm: number) => void;
}

const SVG_HEIGHT = 420;
const X_AXIS_HEIGHT = 24;
const MIN_PX_PER_TRACK = 120;
const MIN_SLOT_COUNT = 3;
const ART_SIZE = 48;
const ART_HALF = ART_SIZE / 2;
const CHART_LEFT_PAD = 60;
const CHART_RIGHT_PAD = 50;
const Y_AXIS_LABEL_X = 44;
const PAD = {
  top: 28,
  right: CHART_RIGHT_PAD,
  bottom: 28,
  left: CHART_LEFT_PAD + ART_HALF,
};
const ORIGINAL_BPM_TICK_WIDTH = 12;
const ORIGINAL_BPM_TICK_HEIGHT = 6;
const ORIGINAL_BPM_TICK_HALF = ORIGINAL_BPM_TICK_WIDTH / 2;
const ART_HIT_PADDING = 6;
const LINE_STROKE = 3;
const Y_AXIS_FONT_SIZE = 13;
const TIGHT_BPM_SPAN = 5;
const BPM_AXIS_PADDING = 10;
const CURVE_TENSION = 0.45;

const ENERGY_ARC_LEGEND: Array<{
  type: CompatibilityType;
  label: string;
  explanation: string;
}> = [
  {
    type: "perfect",
    label: "Perfect Match",
    explanation: "Same Camelot key — lock in and blend seamlessly.",
  },
  {
    type: "relative",
    label: "Relative Key",
    explanation: "Major/minor pair — flows naturally, crowd stays locked in.",
  },
  {
    type: "compatible",
    label: "Compatible",
    explanation: "Two steps out — workable with a quick, confident mix.",
  },
  {
    type: "energy_boost",
    label: "Energy Boost",
    explanation: "One step up the wheel — lifts the room and builds momentum.",
  },
  {
    type: "energy_drop",
    label: "Energy Drop",
    explanation: "One step down the wheel — cools the floor for a breather.",
  },
  {
    type: "adjacent",
    label: "Adjacent Key",
    explanation: "One hop on the wheel — smooth, but mind the mode shift.",
  },
  {
    type: "incompatible",
    label: "Incompatible",
    explanation: "Keys clash — bridge with a transition track or EQ swap.",
  },
];

function buildBezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const cp1x = x1 + dx * CURVE_TENSION;
  const cp1y = y1;
  const cp2x = x2 - dx * CURVE_TENSION;
  const cp2y = y2;
  return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
}

interface ChartPoint {
  x: number;
  y: number | null;
}

function buildSegments(
  tracks: SetlistTrack[],
  points: ChartPoint[]
): Array<{ index: number; color: string; visible: boolean; path: string }> {
  return tracks.slice(0, -1).map((from, index) => {
    const to = tracks[index + 1];
    const analysis = getTransitionAnalysis(from, to);
    const color = analysis
      ? getKeyCompatStyle(analysis.keyCompat.type).color
      : "rgba(148, 163, 184, 0.5)";
    const fromPoint = points[index];
    const toPoint = points[index + 1];
    const y1 = fromPoint.y;
    const y2 = toPoint.y;
    const visible = y1 != null && y2 != null;

    return {
      index,
      color,
      visible,
      path: visible ? buildBezierPath(fromPoint.x, y1, toPoint.x, y2) : "",
    };
  });
}

function displayCamelotLabel(track: SetlistTrack): string {
  if (track.camelot_label) return track.camelot_label;
  if (track.musical_key) return track.musical_key;
  return "—";
}

function getSlotCount(trackCount: number): number {
  return Math.max(trackCount, MIN_SLOT_COUNT);
}

function computeViewWidth(slotCount: number, containerWidth: number): number {
  const safeContainer = Math.max(containerWidth, 320);
  const slotBasedWidth = slotCount * MIN_PX_PER_TRACK;
  return Math.max(safeContainer, slotBasedWidth);
}

function xAt(position: number, slotCount: number, viewWidth: number): number {
  const innerW = viewWidth - PAD.left - PAD.right;
  if (slotCount <= 1) return PAD.left + innerW / 2;
  return PAD.left + ((position - 1) / (slotCount - 1)) * innerW;
}

function yAt(bpm: number, yMin: number, yMax: number): number {
  const innerH = SVG_HEIGHT - PAD.top - PAD.bottom;
  const range = yMax - yMin || 1;
  return PAD.top + (1 - (bpm - yMin) / range) * innerH;
}

function bpmFromY(svgY: number, yMin: number, yMax: number): number {
  const innerH = SVG_HEIGHT - PAD.top - PAD.bottom;
  const clampedY = Math.max(PAD.top, Math.min(SVG_HEIGHT - PAD.bottom, svgY));
  const ratio = 1 - (clampedY - PAD.top) / innerH;
  return Math.round(yMin + ratio * (yMax - yMin));
}

function bpmTicks(yMin: number, yMax: number): number[] {
  const range = yMax - yMin;
  if (range <= TIGHT_BPM_SPAN) {
    const ticks: number[] = [];
    for (let v = Math.ceil(yMin); v <= Math.floor(yMax); v += 1) ticks.push(v);
    if (ticks.length >= 2) return ticks;
    const mid = Math.round((yMin + yMax) / 2);
    return [Math.round(yMin), mid, Math.round(yMax)];
  }
  if (range <= 12) {
    const mid = Math.round((yMin + yMax) / 2);
    return [Math.round(yMin), mid, Math.round(yMax)];
  }
  const step = range <= 30 ? 5 : 10;
  const start = Math.ceil(yMin / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= yMax; v += step) ticks.push(v);
  if (ticks[0] !== Math.round(yMin)) ticks.unshift(Math.round(yMin));
  if (ticks[ticks.length - 1] !== Math.round(yMax)) ticks.push(Math.round(yMax));
  return [...new Set(ticks)];
}

function computeYAxisRange(rawMin: number, rawMax: number): { yMin: number; yMax: number } {
  const spread = rawMax - rawMin;
  if (spread <= TIGHT_BPM_SPAN) {
    const center = (rawMin + rawMax) / 2;
    const yMin = Math.max(1, Math.floor(center - TIGHT_BPM_SPAN / 2));
    const yMax = yMin + TIGHT_BPM_SPAN;
    return { yMin, yMax };
  }
  return {
    yMin: Math.max(1, rawMin - BPM_AXIS_PADDING),
    yMax: rawMax + BPM_AXIS_PADDING,
  };
}

function clientToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  viewWidth: number
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * viewWidth,
    y: ((clientY - rect.top) / rect.height) * SVG_HEIGHT,
  };
}

function collectBpms(tracks: SetlistTrack[]): number[] {
  const values: number[] = [];
  for (const track of tracks) {
    if (track.bpm != null) values.push(track.bpm);
    if (track.original_bpm != null) values.push(track.original_bpm);
  }
  return values;
}

function buildChart(tracks: SetlistTrack[], viewWidth: number) {
  const bpms = collectBpms(tracks.filter((t) => t.bpm != null || t.original_bpm != null));
  if (bpms.length === 0) return null;

  const slotCount = getSlotCount(tracks.length);
  const rawMin = Math.min(...bpms);
  const rawMax = Math.max(...bpms);
  const { yMin, yMax } = computeYAxisRange(rawMin, rawMax);

  const points = tracks.map((track, index) => ({
    track,
    index,
    position: index + 1,
    x: xAt(index + 1, slotCount, viewWidth),
    y: track.bpm != null ? yAt(track.bpm, yMin, yMax) : null,
    bpm: track.bpm,
    originalBpm: track.original_bpm ?? track.bpm,
    ghostY:
      track.original_bpm != null || track.bpm != null
        ? yAt(track.original_bpm ?? track.bpm!, yMin, yMax)
        : null,
    isAdjusted:
      track.bpm != null &&
      track.original_bpm != null &&
      track.bpm !== track.original_bpm,
  }));

  const segments = buildSegments(
    tracks,
    points.map(({ x, y }) => ({ x, y }))
  );

  return {
    points,
    segments,
    slotCount,
    yMin,
    yMax,
    ticks: bpmTicks(yMin, yMax),
    viewWidth,
  };
}

function computeTooltipPlacement(
  pointX: number,
  pointY: number,
  viewWidth: number,
  chartHeight: number,
  tooltipWidth: number,
  tooltipHeight: number,
  visibleLeft = 0,
  visibleWidth = viewWidth
): { left: number; top: number } {
  const margin = 8;
  const gap = 12;
  const isRightHalf = pointX >= viewWidth / 2;

  let left = isRightHalf ? pointX - gap - tooltipWidth : pointX + gap;
  let top = pointY - gap - tooltipHeight;

  if (top < margin) {
    top = pointY + ART_HALF + gap;
  }

  const minLeft = Math.max(margin, visibleLeft + margin);
  const maxLeft = Math.min(viewWidth - tooltipWidth - margin, visibleLeft + visibleWidth - tooltipWidth - margin);

  left = Math.max(minLeft, Math.min(left, maxLeft));
  top = Math.max(margin, Math.min(top, chartHeight - tooltipHeight - margin));

  return { left, top };
}

interface EnergyArcTooltipProps {
  point: {
    x: number;
    y: number;
    index: number;
    track: SetlistTrack;
    bpm: number | null;
    originalBpm?: number | null;
    isAdjusted?: boolean;
  };
  viewWidth: number;
  chartHeight: number;
  visibleLeft: number;
  visibleWidth: number;
  isDragging: boolean;
  dragBpm: number | null;
}

function EnergyArcTooltip({
  point,
  viewWidth,
  chartHeight,
  visibleLeft,
  visibleWidth,
  isDragging,
  dragBpm,
}: EnergyArcTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: point.x, top: point.y });

  const displayBpm = (isDragging ? dragBpm : point.bpm) ?? "—";

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;

    const { width, height } = el.getBoundingClientRect();
    setPosition(
      computeTooltipPlacement(
        point.x,
        point.y,
        viewWidth,
        chartHeight,
        width,
        height,
        visibleLeft,
        visibleWidth
      )
    );
  }, [
    point.x,
    point.y,
    viewWidth,
    chartHeight,
    visibleLeft,
    visibleWidth,
    isDragging,
    dragBpm,
    point.track.name,
    displayBpm,
  ]);

  return (
    <div
      ref={tooltipRef}
      className="pointer-events-none absolute z-20 px-2.5 py-1.5 rounded-md border border-border bg-popover text-popover-foreground shadow-lg min-w-[8rem] max-w-[14rem]"
      style={{
        left: position.left,
        top: position.top,
        transition: isDragging ? "none" : "top 120ms ease, left 120ms ease",
      }}
    >
      <p className="text-[11px] font-semibold leading-snug">{point.track.name}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
        {isDragging ? (
          <>{displayBpm} BPM</>
        ) : (
          <>
            {displayBpm} BPM · {displayCamelotLabel(point.track)}
          </>
        )}
      </p>
      {!isDragging && point.originalBpm != null && point.isAdjusted && (
        <p className="text-[9px] text-muted-foreground/80 mt-0.5 font-mono">
          Original: {point.originalBpm} BPM
        </p>
      )}
      {isDragging && (
        <p className="text-[9px] text-[#c084fc] mt-1">Release to set BPM</p>
      )}
    </div>
  );
}

function EnergyArcColorLegend() {
  const [legendOpen, setLegendOpen] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!legendOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (legendRef.current && !legendRef.current.contains(e.target as Node)) {
        setLegendOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [legendOpen]);

  return (
    <div className="relative flex-shrink-0" ref={legendRef}>
      <button
        type="button"
        onClick={() => setLegendOpen((open) => !open)}
        aria-expanded={legendOpen}
        aria-haspopup="dialog"
        aria-label="Transition color guide"
        className={cn(
          "flex size-7 items-center justify-center rounded-lg border transition-colors",
          legendOpen
            ? "border-[#a855f7]/40 bg-[#a855f7]/15 text-[#c084fc]"
            : "border-border/60 bg-surface-raised/80 text-muted-foreground hover:border-[#a855f7]/30 hover:text-[#c084fc]"
        )}
      >
        <CircleHelp className="size-4" />
      </button>

      {legendOpen && (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-30 w-[min(19rem,calc(100vw-2.5rem))] rounded-xl border border-border bg-popover shadow-2xl overflow-hidden"
          role="dialog"
          aria-label="Transition color guide"
        >
          <div className="px-3.5 py-2.5 border-b border-border/50 bg-surface-raised/40">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Transition Colors
            </p>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-snug">
              Arc line colors reflect Camelot key compatibility between tracks.
            </p>
          </div>
          <ul className="flex flex-col gap-0 divide-y divide-border/40 max-h-[min(22rem,70vh)] overflow-y-auto p-2">
            {ENERGY_ARC_LEGEND.map(({ type, label, explanation }) => {
              const { color } = getKeyCompatStyle(type);
              return (
                <li key={type} className="flex items-start gap-3 px-1.5 py-2.5">
                  <span
                    className="size-3.5 rounded-full flex-shrink-0 mt-0.5 ring-2 ring-white/10 shadow-sm"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 10px ${color}66`,
                    }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground leading-tight">
                      {label}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                      {explanation}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function EnergyArcHeaderRow() {
  return (
    <div className="flex items-center gap-2.5 min-w-0 mb-3 pr-10">
      <Activity className="size-5 text-[#a855f7] flex-shrink-0" />
      <h3 className="text-sm font-semibold tracking-wide text-foreground truncate">
        Energy Arc
      </h3>
      <span className="text-xs text-muted-foreground hidden sm:inline flex-shrink-0">
        Drag artwork to adjust BPM
      </span>
    </div>
  );
}

function EnergyArcCard({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "relative w-full min-w-0 max-w-full rounded-2xl border bg-surface/60 p-3 sm:p-4",
        className
      )}
      style={style}
    >
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20">
        <EnergyArcColorLegend />
      </div>
      <EnergyArcHeaderRow />
      {children}
    </div>
  );
}

export function EnergyArc({ tracks, onBpmChange }: EnergyArcProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingBpmRef = useRef<{ index: number; bpm: number } | null>(null);

  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragBpm, setDragBpm] = useState<number | null>(null);
  const [dragAxis, setDragAxis] = useState<{ yMin: number; yMax: number } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateWidth = () => setContainerWidth(el.clientWidth);
    const updateScroll = () => setScrollLeft(el.scrollLeft);

    updateWidth();
    updateScroll();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    el.addEventListener("scroll", updateScroll, { passive: true });

    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", updateScroll);
    };
  }, [tracks.length]);

  const displayTracks = useMemo(() => {
    if (draggingIndex == null || dragBpm == null) return tracks;
    return tracks.map((track, index) =>
      index === draggingIndex ? { ...track, bpm: dragBpm } : track
    );
  }, [tracks, draggingIndex, dragBpm]);

  const slotCount = getSlotCount(displayTracks.length);
  const viewWidth = useMemo(
    () => computeViewWidth(slotCount, containerWidth),
    [slotCount, containerWidth]
  );

  const chart = useMemo(() => {
    const built = buildChart(displayTracks, viewWidth);
    if (!built) return null;
    if (!dragAxis) return built;

    const { yMin, yMax } = dragAxis;
    const points = built.points.map((point) => ({
      ...point,
      y: point.bpm != null ? yAt(point.bpm, yMin, yMax) : null,
      ghostY:
        point.originalBpm != null ? yAt(point.originalBpm, yMin, yMax) : null,
      isAdjusted:
        point.bpm != null &&
        point.originalBpm != null &&
        point.bpm !== point.originalBpm,
    }));

    const segments = buildSegments(
      displayTracks,
      points.map(({ x, y }) => ({ x, y }))
    );

    return {
      points,
      segments,
      slotCount: built.slotCount,
      yMin,
      yMax,
      ticks: bpmTicks(yMin, yMax),
      viewWidth,
    };
  }, [displayTracks, dragAxis, viewWidth]);

  const flushBpmChange = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const pending = pendingBpmRef.current;
    if (pending) {
      onBpmChange(pending.index, pending.bpm);
      pendingBpmRef.current = null;
    }
  }, [onBpmChange]);

  const scheduleBpmChange = useCallback(
    (index: number, bpm: number) => {
      pendingBpmRef.current = { index, bpm };
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const pending = pendingBpmRef.current;
        if (pending) onBpmChange(pending.index, pending.bpm);
      });
    },
    [onBpmChange]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (draggingIndex == null || !svgRef.current || !chart) return;

      const axis = dragAxis ?? chart;
      const { y } = clientToSvg(
        svgRef.current,
        event.clientX,
        event.clientY,
        chart.viewWidth
      );
      const nextBpm = Math.max(1, bpmFromY(y, axis.yMin, axis.yMax));
      setDragBpm(nextBpm);
      scheduleBpmChange(draggingIndex, nextBpm);
    },
    [chart, dragAxis, draggingIndex, scheduleBpmChange]
  );

  const handlePointerUp = useCallback(() => {
    flushBpmChange();
    setDraggingIndex(null);
    setDragBpm(null);
    setDragAxis(null);
  }, [flushBpmChange]);

  useEffect(() => {
    if (draggingIndex == null) return;

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [draggingIndex, handlePointerMove, handlePointerUp]);

  useEffect(() => () => flushBpmChange(), [flushBpmChange]);

  const startDrag = useCallback(
    (index: number, event: React.PointerEvent<HTMLElement>) => {
      if (!chart) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      const track = tracks[index];
      const startBpm =
        track.bpm ??
        Math.round((chart.yMin + chart.yMax) / 2);

      setDraggingIndex(index);
      setDragBpm(startBpm);
      setDragAxis({ yMin: chart.yMin, yMax: chart.yMax });
      setHoveredIndex(index);
      scheduleBpmChange(index, startBpm);
    },
    [chart, tracks, scheduleBpmChange]
  );

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col gap-3 w-full min-w-0 max-w-full">
        <EnergyArcCard className="border-[#a855f7]/15">
          <div
            className="flex items-center justify-center w-full min-w-0"
            style={{ height: SVG_HEIGHT }}
          >
            <p className="text-sm text-muted-foreground px-4 text-center">
              Add tracks to see your set&apos;s energy flow
            </p>
          </div>
        </EnergyArcCard>
      </div>
    );
  }

  if (!chart) {
    return (
      <div className="flex flex-col gap-3 w-full min-w-0 max-w-full">
        <EnergyArcCard className="border-[#a855f7]/15">
          <div
            className="flex items-center justify-center w-full min-w-0"
            style={{ height: SVG_HEIGHT }}
          >
            <p className="text-sm text-muted-foreground px-4 text-center">
              BPM data needed to draw the energy arc
            </p>
          </div>
        </EnergyArcCard>
      </div>
    );
  }

  const activeIndex = draggingIndex ?? hoveredIndex;
  const activePoint = activeIndex != null ? chart.points[activeIndex] : null;
  const tooltipPoint =
    activePoint != null && activePoint.y != null
      ? { ...activePoint, y: activePoint.y }
      : null;
  const isScrollable = viewWidth > containerWidth && containerWidth > 0;

  return (
    <div className="flex flex-col gap-3 w-full min-w-0 max-w-full">
      <EnergyArcCard
        className="border-[#a855f7]/20"
        style={{
          boxShadow: "0 0 48px rgba(168,85,247,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {isScrollable && (
          <p className="text-[10px] text-muted-foreground/70 mb-2 sm:hidden">
            Scroll horizontally to see all tracks
          </p>
        )}

        <div
          ref={scrollRef}
          className="energy-arc-scroll w-full min-w-0 overflow-x-auto overflow-y-visible"
        >
          <div
            className="relative select-none"
            style={{ width: viewWidth, minWidth: "100%" }}
          >
            <svg
              ref={svgRef}
              width={viewWidth}
              height={SVG_HEIGHT}
              viewBox={`0 0 ${viewWidth} ${SVG_HEIGHT}`}
              className="block touch-none"
              role="img"
              aria-label="BPM energy arc across set track order"
            >
              {chart.ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={PAD.left}
                    y1={yAt(tick, chart.yMin, chart.yMax)}
                    x2={viewWidth - PAD.right}
                    y2={yAt(tick, chart.yMin, chart.yMax)}
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth={1}
                  />
                  <text
                    x={Y_AXIS_LABEL_X}
                    y={yAt(tick, chart.yMin, chart.yMax)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fill="rgba(148,163,184,0.85)"
                    fontSize={Y_AXIS_FONT_SIZE}
                    fontWeight={500}
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {tick}
                  </text>
                </g>
              ))}

              <text
                x={14}
                y={16}
                fill="rgba(148,163,184,0.55)"
                fontSize={11}
                fontWeight={500}
                style={{ fontFamily: "var(--font-sans)" }}
              >
                BPM
              </text>

              {chart.segments.map(
                (seg) =>
                  seg.visible && (
                    <path
                      key={`seg-${seg.index}`}
                      d={seg.path}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth={LINE_STROKE}
                      strokeLinecap="round"
                      opacity={0.9}
                      style={{ transition: draggingIndex != null ? "none" : "stroke 150ms ease" }}
                    />
                  )
              )}

              {chart.points.map(({ track, x, ghostY, isAdjusted }) =>
                isAdjusted && ghostY != null ? (
                  <rect
                    key={`original-bpm-${track.spotify_id}`}
                    x={x - ORIGINAL_BPM_TICK_HALF}
                    y={ghostY - ORIGINAL_BPM_TICK_HEIGHT / 2}
                    width={ORIGINAL_BPM_TICK_WIDTH}
                    height={ORIGINAL_BPM_TICK_HEIGHT}
                    rx={1}
                    fill="#ffffff"
                    fillOpacity={0.8}
                    pointerEvents="none"
                  />
                ) : null
              )}
            </svg>

            {chart.points.map(({ track, index, x, y }) => {
              if (y == null) return null;

              const isDragging = draggingIndex === index;
              const isHovered = hoveredIndex === index;

              return (
                <div
                  key={`marker-${track.spotify_id}`}
                  className="absolute z-10 pointer-events-none"
                  style={{
                    left: x - ART_HALF,
                    top: y - ART_HALF,
                    width: ART_SIZE,
                  }}
                >
                  <div
                    className="pointer-events-auto cursor-ns-resize touch-none"
                    style={{
                      width: ART_SIZE + ART_HIT_PADDING * 2,
                      height: ART_SIZE + ART_HIT_PADDING * 2,
                      margin: -ART_HIT_PADDING,
                      padding: ART_HIT_PADDING,
                    }}
                    onPointerDown={(e) => startDrag(index, e)}
                    onMouseEnter={() => {
                      if (draggingIndex == null) setHoveredIndex(index);
                    }}
                    onMouseLeave={() => {
                      if (draggingIndex == null) setHoveredIndex(null);
                    }}
                  >
                    <div
                      className="relative overflow-hidden ring-1 ring-white/15 transition-shadow duration-150"
                      style={{
                        width: ART_SIZE,
                        height: ART_SIZE,
                        boxShadow: isDragging
                          ? "0 0 0 2px rgba(168,85,247,0.8), 0 0 12px rgba(168,85,247,0.45)"
                          : isHovered
                            ? "0 0 0 2px rgba(168,85,247,0.5), 0 0 8px rgba(168,85,247,0.25)"
                            : undefined,
                      }}
                    >
                      {track.image ? (
                        <img
                          src={track.image}
                          alt=""
                          width={ART_SIZE}
                          height={ART_SIZE}
                          draggable={false}
                          className="block size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-muted">
                          <Music className="size-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div
              className="relative mt-1"
              style={{ height: X_AXIS_HEIGHT, width: viewWidth }}
            >
              {chart.points.map(({ position, x }) => (
                <span
                  key={`x-label-${position}`}
                  className="absolute top-0 -translate-x-1/2 text-[11px] font-mono font-medium text-muted-foreground/80"
                  style={{ left: x }}
                >
                  {position}
                </span>
              ))}
            </div>

            {tooltipPoint && (
              <EnergyArcTooltip
                point={tooltipPoint}
                viewWidth={viewWidth}
                chartHeight={SVG_HEIGHT}
                visibleLeft={scrollLeft}
                visibleWidth={containerWidth > 0 ? containerWidth : viewWidth}
                isDragging={draggingIndex === tooltipPoint.index}
                dragBpm={dragBpm}
              />
            )}
          </div>
        </div>
      </EnergyArcCard>
    </div>
  );
}
