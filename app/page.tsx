"use client";

import { useState, useCallback } from "react";
import { Disc3, Loader2, ArrowLeftRight } from "lucide-react";
import { TrackSearch, TrackResult } from "@/components/track-search";
import { CompatibilityCard, TrackFeatures } from "@/components/compatibility-card";
import { AppShell } from "@/components/app-shell";
import { ArtworkMosaicWall } from "@/components/artwork-mosaic-wall";
import { addTrackToSetlist, buildSetlistTrack } from "@/lib/setlist";
import { cn } from "@/lib/utils";

function SourceBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none",
        className
      )}
    >
      {children}
    </span>
  );
}

function FooterCategory({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-widest text-white/40">
      {label}
    </span>
  );
}

function SourceBadgesFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("flex w-full justify-center", className)}>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-3 max-w-3xl">
        <div className="flex items-center gap-2">
          <FooterCategory label="Tracks" />
          <SourceBadge className="border-emerald-500/35 bg-emerald-500/10 text-emerald-400">
            Spotify
          </SourceBadge>
        </div>

        <span aria-hidden="true" className="text-white/20">
          |
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <FooterCategory label="BPM & Key" />
          <SourceBadge className="border-[#a855f7]/35 bg-[#a855f7]/10 text-[#c084fc]">
            ReccoBeats
          </SourceBadge>
          <SourceBadge className="border-blue-500/35 bg-blue-500/10 text-blue-400">
            SoundNet
          </SourceBadge>
          <SourceBadge className="border-amber-500/35 bg-amber-500/10 text-amber-400">
            GetSongBPM
          </SourceBadge>
        </div>

        <span aria-hidden="true" className="text-white/20">
          |
        </span>

        <div className="flex items-center gap-2">
          <FooterCategory label="Genres" />
          <SourceBadge className="border-red-500/35 bg-red-500/10 text-red-400">
            Last.fm
          </SourceBadge>
        </div>
      </div>
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
    <AppShell>
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

      {isEmptyState && <ArtworkMosaicWall active />}

      <div
        className={cn(
          "relative z-10 mx-auto flex w-full max-w-3xl flex-col px-4 pb-8",
          isEmptyState ? "min-h-screen justify-center" : "pt-12"
        )}
      >
        <div className="relative z-10 flex w-full flex-col gap-8">

        <div className="flex flex-col">
        {/* Header */}
        <header className="mb-3 w-full text-left">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex size-11 flex-shrink-0 items-center justify-center rounded-xl border"
              style={{
                borderColor: "rgba(168,85,247,0.3)",
                background: "rgba(168,85,247,0.1)",
                boxShadow: "0 0 24px rgba(168,85,247,0.2)",
              }}
            >
              <Disc3 className="size-5" style={{ color: "#a855f7" }} />
            </div>
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground md:text-2xl">
              Compatibility
            </h1>
          </div>
        </header>

        {/* Search Panel */}
        <section
          aria-label="Track selection"
          className="rounded-2xl border border-border bg-card p-5 md:p-6 flex flex-col gap-5"
          style={{ boxShadow: "0 0 40px rgba(0,0,0,0.5)" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] gap-4 items-start min-w-0">
            <div className="min-w-0">
              <TrackSearch
                label="Track 1"
                accentColor="purple"
                selectedTrack={trackA}
                onSelect={handleSelectA}
                onClear={handleClearA}
                bpm={analysis.featuresA?.bpm}
                musicalKey={analysis.featuresA?.musical_key}
              />
            </div>

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

            <div className="min-w-0">
              <TrackSearch
                label="Track 2"
                accentColor="blue"
                selectedTrack={trackB}
                onSelect={handleSelectB}
                onClear={handleClearB}
                bpm={analysis.featuresB?.bpm}
                musicalKey={analysis.featuresB?.musical_key}
              />
            </div>
          </div>

          {!trackA && !trackB && (
            <p className="empty-state-gradient-text text-center text-xs">
              Search two Spotify tracks to analyze BPM, key, and Camelot compatibility.
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
        </div>

        {isEmptyState && <SourceBadgesFooter />}

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

        {!isEmptyState && <SourceBadgesFooter className="pt-6" />}

        </div>
      </div>
    </main>
    </AppShell>
  );
}
