"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { GradientFlowIcon } from "@/components/gradient-flow-icon";
import { TrackSearch, TrackResult } from "@/components/track-search";
import { CompatibilityCard, TrackFeatures } from "@/components/compatibility-card";
import { SourceBadgesFooter } from "@/components/source-badges-footer";
import { addTrackToSetlist, buildSetlistTrack } from "@/lib/setlist";
import {
  COHESIVE_CARD_CLASS,
  COHESIVE_PANEL_CLASS,
  COHESIVE_TITLE_SHADOW,
  COHESIVE_SURFACE_STYLE,
  PAGE_SECTION_CARD_CLASS,
  cohesiveCardStyle,
} from "@/lib/ui-surfaces";
import { COMPATIBILITY_NAV_RESET_EVENT } from "@/lib/compatibility-nav-reset";
import {
  DEFAULT_EXAMPLE_ARTIST_PAIR,
  PLACEHOLDER_ROTATE_MS,
  pickExampleArtistPair,
} from "@/lib/example-artist-placeholders";
import { useDocumentVisible } from "@/lib/use-document-visible";
import { cn } from "@/lib/utils";

const SEARCH_PANEL_HELPER_TEXT =
  "Search two Spotify tracks to analyze BPM, key, and Camelot compatibility.";

/** Search inputs area inside the unified search card. */
const SEARCH_PANEL_BODY_CLASS =
  "flex flex-col gap-2 px-6 pt-6";

/** Fixed-height helper row — same height for empty and single-track states. */
const SEARCH_PANEL_HELPER_ROW_CLASS =
  "flex min-h-[2.75rem] shrink-0 items-center justify-center px-1";

/** Page title pill above the search card. */
const COMPATIBILITY_TITLE_PILL_CLASS =
  "inline-flex min-w-0 max-w-full items-center rounded-2xl border border-[#a855f7]/60 px-4 py-2.5";

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
  const [exampleArtistPair, setExampleArtistPair] = useState<[string, string]>(
    DEFAULT_EXAMPLE_ARTIST_PAIR
  );
  const [openSearchSlot, setOpenSearchSlot] = useState<"A" | "B" | null>(null);
  const [searchResetKey, setSearchResetKey] = useState(0);
  const scrollAnchorYRef = useRef<number | null>(null);
  const documentVisible = useDocumentVisible();

  const resetCompatibilityPage = useCallback(() => {
    setTrackA(null);
    setTrackB(null);
    setAnalysis(emptyAnalysis);
    setSetlistMessage(null);
    setOpenSearchSlot(null);
    setSearchResetKey((key) => key + 1);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

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
    function handleCompatibilityNavReset() {
      resetCompatibilityPage();
    }

    window.addEventListener(
      COMPATIBILITY_NAV_RESET_EVENT,
      handleCompatibilityNavReset
    );
    return () => {
      window.removeEventListener(
        COMPATIBILITY_NAV_RESET_EVENT,
        handleCompatibilityNavReset
      );
    };
  }, [resetCompatibilityPage]);

  useEffect(() => {
    if (!bothTracksEmpty || !documentVisible) return;

    const timer = window.setInterval(() => {
      setExampleArtistPair((current) => pickExampleArtistPair(current));
    }, PLACEHOLDER_ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [bothTracksEmpty, documentVisible]);

  useLayoutEffect(() => {
    if (scrollAnchorYRef.current === null) return;
    window.scrollTo(0, scrollAnchorYRef.current);
    scrollAnchorYRef.current = null;
  }, [trackA, trackB]);

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
      if (data.partial) {
        throw new Error(
          data.message ?? "Still analyzing — try searching again in a moment"
        );
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
    if (!trackB) scrollAnchorYRef.current = window.scrollY;
    setTrackA(track);
    setAnalysis(emptyAnalysis);
    if (trackB) analyze(track, trackB);
  }

  function handleSelectB(track: TrackResult) {
    if (!trackA) scrollAnchorYRef.current = window.scrollY;
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

  const showAnalysisSection =
    analysis.loading || (analysis.error && !analysis.loading) || hasResults;

  return (
    <main className="font-sans">
      <div className="relative z-10 mx-auto w-full max-w-2xl px-4 pb-8">
        <div
          className={cn(
            "flex w-full flex-col gap-5",
            showAnalysisSection ? "pt-12" : "min-h-screen items-center justify-center"
          )}
        >
          <header className="w-full">
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

          <div
            className={cn(
              "flex w-full flex-col",
              hasResults ? "gap-3" : "gap-5"
            )}
          >
            <section
              aria-label="Track selection"
              className={cn(
                "relative z-20 flex shrink-0 flex-col overflow-visible",
                COHESIVE_CARD_CLASS,
                COHESIVE_PANEL_CLASS
              )}
              style={cohesiveCardStyle()}
            >
              <div className={cn(SEARCH_PANEL_BODY_CLASS, hasResults && "pb-4")}>
                <div className="grid shrink-0 grid-cols-1 md:grid-cols-2 gap-4 items-start min-w-0">
                  <div
                    className={cn(
                      "min-w-0",
                      openSearchSlot === "B" ? searchPanelDimClass : searchPanelFullClass
                    )}
                  >
                    <TrackSearch
                      key={`track-a-${searchResetKey}`}
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
                      enableFavoritesFilter
                    />
                  </div>

                  <div
                    className={cn(
                      "min-w-0",
                      openSearchSlot === "A" ? searchPanelDimClass : searchPanelFullClass
                    )}
                  >
                    <TrackSearch
                      key={`track-b-${searchResetKey}`}
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
                      enableFavoritesFilter
                    />
                  </div>
                </div>

                {!(trackA && trackB) && (
                  <div
                    className={cn(
                      SEARCH_PANEL_HELPER_ROW_CLASS,
                      isSearchDropdownOpen ? searchPanelDimClass : searchPanelFullClass
                    )}
                  >
                    {bothTracksEmpty ? (
                      <p className="empty-state-gradient-text text-center text-xs leading-relaxed">
                        {SEARCH_PANEL_HELPER_TEXT}
                      </p>
                    ) : (
                      <p className="text-center text-xs text-muted-foreground/50">
                        {trackA
                          ? "Now search for Track 2 to see the compatibility report"
                          : "Now search for Track 1 to see the compatibility report"}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {!hasResults && (
                <div
                  className={cn(
                    "border-t border-white/10 px-6 pt-4 pb-5",
                    isSearchDropdownOpen ? searchPanelDimClass : searchPanelFullClass
                  )}
                >
                  <SourceBadgesFooter />
                </div>
              )}
            </section>

            {hasResults && (
              <section
                aria-label="Compatibility analysis results"
                className={cn(PAGE_SECTION_CARD_CLASS, "flex flex-col gap-6 overflow-visible")}
                style={cohesiveCardStyle()}
              >
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

            {showAnalysisSection && !hasResults && (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
