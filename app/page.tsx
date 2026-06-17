"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { GradientFlowIcon } from "@/components/gradient-flow-icon";
import { TrackSearch, TrackResult } from "@/components/track-search";
import { CompatibilityCard, TrackFeatures } from "@/components/compatibility-card";
import { addTrackToSetlist, buildSetlistTrack } from "@/lib/setlist";
import {
  COHESIVE_CARD_CLASS,
  COHESIVE_PANEL_CLASS,
  COHESIVE_TITLE_SHADOW,
  COHESIVE_SURFACE_STYLE,
  PAGE_SECTION_CARD_CLASS,
  cohesiveCardStyle,
} from "@/lib/ui-surfaces";
import { cn } from "@/lib/utils";

const SEARCH_PANEL_HELPER_TEXT =
  "Search two Spotify tracks to analyze BPM, key, and Camelot compatibility.";

const EXAMPLE_ARTIST_POOL = [
  "Calvin Harris",
  "Zedd",
  "Skrillex",
  "Prospa",
  "Kettama",
  "RÜFÜS DU SOL",
  "Adam Port",
  "Dom Dolla",
  "John Summit",
  "David Guetta",
  "Sonny Fodera",
  "FISHER",
  "Anyma",
  "Tiësto",
  "Fred Again..",
  "DJ Snake",
  "Alesso",
  "Mau P",
  "Chris Stussy",
  "Silva Bumpa",
  "Chris Lake",
  "Peggy Gou",
] as const;

const PLACEHOLDER_ROTATE_MS = 7500;

function pickExampleArtistPair(exclude?: readonly [string, string]): [string, string] {
  const artists = EXAMPLE_ARTIST_POOL;
  for (let attempt = 0; attempt < 24; attempt++) {
    const firstIndex = Math.floor(Math.random() * artists.length);
    let secondIndex = Math.floor(Math.random() * artists.length);
    if (secondIndex === firstIndex) {
      secondIndex = (secondIndex + 1) % artists.length;
    }
    const pair: [string, string] = [artists[firstIndex], artists[secondIndex]];
    if (exclude && pair[0] === exclude[0] && pair[1] === exclude[1]) continue;
    return pair;
  }
  return [artists[0], artists[1]];
}

/** Search inputs area inside the unified search card. */
const SEARCH_PANEL_BODY_CLASS =
  "flex flex-col gap-2 px-6 pt-6 pb-5";

/** Page title pill above the search card. */
const COMPATIBILITY_TITLE_PILL_CLASS =
  "inline-flex min-w-0 max-w-full items-center rounded-2xl border border-[#a855f7]/60 px-4 py-2.5";

/** Geist sans — footer attribution line and source badges. */
const SOURCE_FOOTER_FONT_CLASS = "font-sans";

const SOURCE_BADGE_STYLES = {
  spotify: "border-emerald-500/35 bg-emerald-500/10 text-emerald-400",
  reccobeats: "border-[#a855f7]/35 bg-[#a855f7]/10 text-[#c084fc]",
  soundnet: "border-blue-500/35 bg-blue-500/10 text-blue-400",
  getsongbpm: "border-amber-500/35 bg-amber-500/10 text-amber-400",
  lastfm: "border-red-500/35 bg-red-500/10 text-red-400",
} as const;

type SourceTooltipAccent = "green" | "blue" | "red";

const SOURCE_TOOLTIP_ACCENT_STYLES: Record<SourceTooltipAccent, string> = {
  green: "border-emerald-500/50 bg-emerald-950 text-emerald-400",
  blue: "border-blue-500/50 bg-blue-950 text-blue-400",
  red: "border-red-500/50 bg-red-950 text-red-400",
};

const SOURCE_TOOLTIP_SHADOW =
  "shadow-[0_8px_24px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.35)]";

function SourceBadge({
  children,
  badgeStyle,
}: {
  children: React.ReactNode;
  badgeStyle: (typeof SOURCE_BADGE_STYLES)[keyof typeof SOURCE_BADGE_STYLES];
}) {
  return (
    <span
      className={cn(
        SOURCE_FOOTER_FONT_CLASS,
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-normal whitespace-nowrap",
        badgeStyle
      )}
    >
      {children}
    </span>
  );
}

function SourceCategoryTooltip({
  label,
  accent,
  id,
}: {
  label: string;
  accent: SourceTooltipAccent;
  id: string;
}) {
  const accentStyle = SOURCE_TOOLTIP_ACCENT_STYLES[accent];

  return (
    <div
      id={id}
      role="tooltip"
      className={cn(
        "pointer-events-none absolute top-[calc(100%+12px)] left-1/2 z-[100] -translate-x-1/2",
        "opacity-0 transition-opacity duration-150",
        "group-hover/badge:opacity-100 group-focus-within/badge:opacity-100"
      )}
    >
      <div
        className={cn(
          "rounded-lg border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap",
          SOURCE_TOOLTIP_SHADOW,
          accentStyle
        )}
      >
        {label}
      </div>
    </div>
  );
}

function SourceBadgeHoverGroup({
  tooltipLabel,
  accent,
  tooltipId,
  children,
}: {
  tooltipLabel: string;
  accent: SourceTooltipAccent;
  tooltipId: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="group/badge relative inline-flex items-center"
      tabIndex={0}
      aria-describedby={tooltipId}
    >
      {children}
      <SourceCategoryTooltip label={tooltipLabel} accent={accent} id={tooltipId} />
    </span>
  );
}

function SourceBadgesFooter() {
  return (
    <footer
      className={cn(
        SOURCE_FOOTER_FONT_CLASS,
        "relative z-30 shrink-0 overflow-visible border-t border-white/10 px-6 pt-4 pb-5"
      )}
    >
      <p className="mb-2.5 text-center text-[10px] text-zinc-400/90">
        Next.js · Spotify API · Supabase
      </p>
      <p className="flex min-h-[1.75rem] flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-center text-xs leading-normal">
        <span className="inline-flex items-center gap-2">
          <span className="text-zinc-400/90">Live APIs</span>
          <SourceBadgeHoverGroup tooltipLabel="Tracks" accent="green" tooltipId="source-tooltip-tracks">
            <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.spotify}>Spotify</SourceBadge>
          </SourceBadgeHoverGroup>
          <SourceBadgeHoverGroup
            tooltipLabel="BPM & Key"
            accent="blue"
            tooltipId="source-tooltip-bpm-key"
          >
            <span className="inline-flex items-center gap-1">
              <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.reccobeats}>ReccoBeats</SourceBadge>
              <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.soundnet}>SoundNet</SourceBadge>
              <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.getsongbpm}>GetSongBPM</SourceBadge>
            </span>
          </SourceBadgeHoverGroup>
          <SourceBadgeHoverGroup tooltipLabel="Genres" accent="red" tooltipId="source-tooltip-genres">
            <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.lastfm}>Last.fm</SourceBadge>
          </SourceBadgeHoverGroup>
        </span>
      </p>
    </footer>
  );
}

interface AnalysisState {
  loading: boolean;
  featuresA: TrackFeatures | null;
  featuresB: TrackFeatures | null;
  error: string | null;
}

const emptyAnalysis: AnalysisState = {
  loading: false,
  featuresA: null,
  featuresB: null,
  error: null,
};

export default function Home() {
  const [trackA, setTrackA] = useState<TrackResult | null>(null);
  const [trackB, setTrackB] = useState<TrackResult | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>(emptyAnalysis);
  const [setlistMessage, setSetlistMessage] = useState<string | null>(null);
  const [exampleArtistPair, setExampleArtistPair] = useState<[string, string]>(() =>
    pickExampleArtistPair()
  );
  const [openSearchSlot, setOpenSearchSlot] = useState<"A" | "B" | null>(null);

  const isSearchDropdownOpen = openSearchSlot !== null;
  const searchPanelDimClass = "opacity-25 transition-opacity duration-200";
  const searchPanelFullClass = "opacity-100 transition-opacity duration-200";

  const handleTrackAOpenChange = useCallback((open: boolean) => {
    setOpenSearchSlot((current) => (open ? "A" : current === "A" ? null : current));
  }, []);

  const handleTrackBOpenChange = useCallback((open: boolean) => {
    setOpenSearchSlot((current) => (open ? "B" : current === "B" ? null : current));
  }, []);

  const bothTracksEmpty = !trackA && !trackB;

  useEffect(() => {
    if (!bothTracksEmpty) return;

    const timer = window.setInterval(() => {
      setExampleArtistPair((current) => pickExampleArtistPair(current));
    }, PLACEHOLDER_ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [bothTracksEmpty]);

  const analyze = useCallback(async (a: TrackResult, b: TrackResult) => {
    setAnalysis((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/spotify/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks: [a, b] }),
      });
      const data = await res.json();
      if (!res.ok || !data.features) {
        throw new Error(data.error ?? "Failed to fetch track data");
      }
      const [fA, fB] = data.features;
      if (!fA || !fB) {
        throw new Error("Track data unavailable for one or both tracks");
      }
      setAnalysis({
        loading: false,
        featuresA: fA,
        featuresB: fB,
        error: null,
      });
    } catch (err) {
      setAnalysis((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Something went wrong",
      }));
    }
  }, []);

  function handleSelectA(track: TrackResult) {
    setTrackA(track);
    setAnalysis(emptyAnalysis);
    if (trackB) analyze(track, trackB);
  }

  function handleSelectB(track: TrackResult) {
    setTrackB(track);
    setAnalysis(emptyAnalysis);
    if (trackA) analyze(trackA, track);
  }

  function handleClearA() {
    setTrackA(null);
    setAnalysis(emptyAnalysis);
  }

  function handleClearB() {
    setTrackB(null);
    setAnalysis(emptyAnalysis);
  }

  function handleAddToSet(slot: "A" | "B") {
    const track = slot === "A" ? trackA : trackB;
    const features = slot === "A" ? analysis.featuresA : analysis.featuresB;
    if (!track || !features) return;

    const { added } = addTrackToSetlist(buildSetlistTrack(track, features));
    setSetlistMessage(
      added
        ? `Added "${track.name}" to set — view in Set Planner`
        : `"${track.name}" is already in your set`
    );
  }

  const hasResults =
    !analysis.loading &&
    !analysis.error &&
    analysis.featuresA &&
    analysis.featuresB &&
    trackA &&
    trackB;

  const isEmptyState =
    !trackA && !trackB && !hasResults && !analysis.loading && !analysis.error;

  return (
    <main className="min-h-screen font-sans">
      <div
        className={cn(
          "relative z-10 mx-auto flex w-full max-w-2xl flex-col px-4 pb-8",
          isEmptyState ? "min-h-screen justify-center -mt-6" : "pt-12"
        )}
      >
        <div className="relative z-10 flex w-full flex-col gap-5">

        <div className="flex flex-col">
        <header className="mb-3 w-full">
          <div
            className={cn(COMPATIBILITY_TITLE_PILL_CLASS, COHESIVE_PANEL_CLASS)}
            style={{
              ...COHESIVE_SURFACE_STYLE,
              ...COHESIVE_TITLE_SHADOW,
            }}
          >
            <div className="-ml-0.5 flex size-10 flex-shrink-0 items-center justify-center">
              <GradientFlowIcon name="disc-3" className="size-6" />
            </div>
            <h1 className="gradient-flow-text ml-0.5 truncate text-xl font-bold tracking-tight md:text-2xl">
              Compatibility
            </h1>
          </div>
        </header>

        {/* Search Panel */}
        <section
          aria-label="Track selection"
          className={cn(
            "relative z-20 flex shrink-0 flex-col overflow-visible",
            COHESIVE_CARD_CLASS,
            COHESIVE_PANEL_CLASS
          )}
          style={cohesiveCardStyle()}
        >
          <div className={SEARCH_PANEL_BODY_CLASS}>
            <div className="grid shrink-0 grid-cols-1 md:grid-cols-2 gap-4 items-start min-w-0">
              <div
                className={cn(
                  "min-w-0",
                  openSearchSlot === "B" ? searchPanelDimClass : searchPanelFullClass
                )}
              >
                <TrackSearch
                  label="Track 1"
                  accentColor="purple"
                  placeholder={exampleArtistPair[0]}
                  animatePlaceholder
                  selectedTrack={trackA}
                  onSelect={handleSelectA}
                  onClear={handleClearA}
                  bpm={analysis.featuresA?.bpm}
                  musicalKey={analysis.featuresA?.musical_key}
                  onOpenChange={handleTrackAOpenChange}
                />
              </div>

              <div
                className={cn(
                  "min-w-0",
                  openSearchSlot === "A" ? searchPanelDimClass : searchPanelFullClass
                )}
              >
                <TrackSearch
                  label="Track 2"
                  accentColor="blue"
                  placeholder={exampleArtistPair[1]}
                  animatePlaceholder
                  selectedTrack={trackB}
                  onSelect={handleSelectB}
                  onClear={handleClearB}
                  bpm={analysis.featuresB?.bpm}
                  musicalKey={analysis.featuresB?.musical_key}
                  onOpenChange={handleTrackBOpenChange}
                />
              </div>
            </div>

            <div
              className={cn(
                "flex min-h-[28px] shrink-0 items-center justify-center px-1 -mt-0.5",
                isSearchDropdownOpen ? searchPanelDimClass : searchPanelFullClass
              )}
            >
              {!trackA && !trackB && (
                <p className="empty-state-gradient-text text-center text-xs leading-relaxed">
                  {SEARCH_PANEL_HELPER_TEXT}
                </p>
              )}
              {(trackA || trackB) && !(trackA && trackB) && (
                <p className="text-center text-xs text-muted-foreground/50">
                  {trackA
                    ? "Now search for Track 2 to see the compatibility report"
                    : "Now search for Track 1 to see the compatibility report"}
                </p>
              )}
            </div>
          </div>

          <div className={isSearchDropdownOpen ? searchPanelDimClass : searchPanelFullClass}>
            <SourceBadgesFooter />
          </div>
        </section>
        </div>

        {/* Loading */}
        {analysis.loading && (
          <div
            className={cn(COHESIVE_CARD_CLASS, "p-12 flex flex-col items-center gap-4")}
            style={cohesiveCardStyle()}
          >
            <div
              className="size-16 rounded-full border-2 flex items-center justify-center"
              style={{ borderColor: "rgba(168,85,247,0.2)" }}
            >
              <Loader2 className="size-7 animate-spin" style={{ color: "#a855f7" }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Analyzing tracks&hellip;</p>
              <p className="text-xs text-muted-foreground mt-1">
                Fetching Spotify metadata and GetSongBPM analysis
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {analysis.error && !analysis.loading && (
          <div
            className="rounded-2xl border p-5 flex flex-col gap-2"
            style={{
              borderColor: "rgba(239,68,68,0.2)",
              background: "rgba(239,68,68,0.05)",
            }}
          >
            <p className="text-sm font-semibold" style={{ color: "#f87171" }}>
              Analysis failed
            </p>
            <p className="text-xs text-muted-foreground">{analysis.error}</p>
          </div>
        )}

        {/* Results */}
        {hasResults && (
          <section
            aria-label="Compatibility analysis results"
            className={cn(PAGE_SECTION_CARD_CLASS, "flex flex-col gap-6")}
            style={cohesiveCardStyle()}
          >
            <div className="flex items-center gap-3 border-b border-border/50 pb-4">
              <div
                className="size-1.5 rounded-full"
                style={{
                  background: "#a855f7",
                  boxShadow: "0 0 6px #a855f7",
                }}
              />
              <h2 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                Compatibility Analysis
              </h2>
            </div>
            <CompatibilityCard
              featuresA={analysis.featuresA!}
              featuresB={analysis.featuresB!}
              onAddToSetA={() => handleAddToSet("A")}
              onAddToSetB={() => handleAddToSet("B")}
            />
            {setlistMessage && (
              <p className="text-xs text-center text-emerald-400">{setlistMessage}</p>
            )}
          </section>
        )}

        </div>
      </div>
    </main>
  );
}
