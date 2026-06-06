"use client";

import { useState, useCallback } from "react";
import { Disc3, Loader2, ArrowLeftRight } from "lucide-react";
import { TrackSearch, TrackResult } from "@/components/track-search";
import { CompatibilityCard, AudioFeatures } from "@/components/compatibility-card";
interface AnalysisState {
  loading: boolean;
  featuresA: AudioFeatures | null;
  featuresB: AudioFeatures | null;
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

  const analyze = useCallback(async (a: TrackResult, b: TrackResult) => {
    setAnalysis((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(`/api/spotify/features?ids=${a.id},${b.id}`);
      const data = await res.json();
      if (!res.ok || !data.features) {
        throw new Error(data.error ?? "Failed to fetch audio features");
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

  function handleSwap() {
    if (!trackA && !trackB) return;
    const tmp = trackA;
    setTrackA(trackB);
    setTrackB(tmp);
    if (trackA && trackB) {
      analyze(trackB, trackA);
    } else {
      setAnalysis(emptyAnalysis);
    }
  }

  const hasResults =
    !analysis.loading &&
    !analysis.error &&
    analysis.featuresA &&
    analysis.featuresB &&
    trackA &&
    trackB;

  return (
    <main className="min-h-screen bg-background font-sans">
      {/* Subtle grid overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(168,85,247,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(168,85,247,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
        aria-hidden="true"
      />
      {/* Ambient glow blobs */}
      <div
        className="fixed top-0 left-1/4 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
        aria-hidden="true"
      />
      <div
        className="fixed top-0 right-1/4 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-12 flex flex-col gap-8">

        {/* Header */}
        <header className="text-center flex flex-col items-center gap-4">
          <div
            className="flex items-center justify-center size-14 rounded-2xl border"
            style={{
              borderColor: "rgba(168,85,247,0.3)",
              background: "rgba(168,85,247,0.1)",
              boxShadow: "0 0 24px rgba(168,85,247,0.2)",
            }}
          >
            <Disc3 className="size-7" style={{ color: "#a855f7" }} />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-balance text-foreground">
              DJ Mix Compatibility
            </h1>
            <p className="mt-2 text-muted-foreground text-pretty max-w-md mx-auto text-sm leading-relaxed">
              Search two Spotify tracks to instantly analyze BPM, musical key, energy, and danceability — with a live Camelot wheel.
            </p>
          </div>
        </header>

        {/* Search Panel */}
        <section
          aria-label="Track selection"
          className="rounded-2xl border border-border bg-card p-5 md:p-6 flex flex-col gap-5"
          style={{ boxShadow: "0 0 40px rgba(0,0,0,0.5)" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-[1fr_44px_1fr] gap-4 items-start">
            <TrackSearch
              label="Track 1"
              accentColor="purple"
              selectedTrack={trackA}
              onSelect={handleSelectA}
              onClear={handleClearA}
            />

            {/* Swap */}
            <div className="flex items-center justify-center md:pt-7">
              <button
                onClick={handleSwap}
                disabled={!trackA && !trackB}
                aria-label="Swap tracks"
                className="size-9 rounded-full border border-border flex items-center justify-center text-muted-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ outline: "none" }}
                onMouseOver={(e) => {
                  if (!(!trackA && !trackB)) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(168,85,247,0.5)";
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(168,85,247,0.1)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#fff";
                  }
                }}
                onMouseOut={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "";
                  (e.currentTarget as HTMLButtonElement).style.background = "";
                  (e.currentTarget as HTMLButtonElement).style.color = "";
                }}
              >
                <ArrowLeftRight className="size-4" />
              </button>
            </div>

            <TrackSearch
              label="Track 2"
              accentColor="blue"
              selectedTrack={trackB}
              onSelect={handleSelectB}
              onClear={handleClearB}
            />
          </div>

          {!trackA && !trackB && (
            <p className="text-xs text-center text-muted-foreground/50">
              Search for a Spotify track in each slot to begin compatibility analysis
            </p>
          )}
          {(trackA || trackB) && !(trackA && trackB) && (
            <p className="text-xs text-center text-muted-foreground/50">
              {trackA
                ? "Now search for Track 2 to see the compatibility report"
                : "Now search for Track 1 to see the compatibility report"}
            </p>
          )}
        </section>

        {/* Loading */}
        {analysis.loading && (
          <div
            className="rounded-2xl border border-border bg-card p-12 flex flex-col items-center gap-4"
            style={{ boxShadow: "0 0 40px rgba(0,0,0,0.5)" }}
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
                Fetching track data from Spotify
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
            className="rounded-2xl border border-border bg-card p-5 md:p-6 flex flex-col gap-6"
            style={{ boxShadow: "0 0 40px rgba(0,0,0,0.5)" }}
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
              trackA={trackA}
              trackB={trackB}
              featuresA={analysis.featuresA!}
              featuresB={analysis.featuresB!}
              camelotA={null}
              camelotB={null}
              keyCompat={null}
            />
          </section>
        )}

        <footer className="text-center text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
          Track data powered by the Spotify Web API &mdash; BPM/key require a dedicated tool (Rekordbox, Mixed In Key)
        </footer>
      </div>
    </main>
  );
}
