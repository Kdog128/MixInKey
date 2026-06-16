"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Disc3, Loader2, ArrowLeftRight, ListMusic } from "lucide-react";
import { TrackSearch, TrackResult } from "@/components/track-search";
import { CompatibilityCard, TrackFeatures, type AudioAnalysisSource } from "@/components/compatibility-card";
import { addTrackToSetlist, buildSetlistTrack } from "@/lib/setlist";

const SOURCE_LABELS: Record<NonNullable<AudioAnalysisSource>, string> = {
  reccobeats: "ReccoBeats",
  getsongbpm: "GetSongBPM",
  soundnet: "SoundNet",
  musicbrainz: "MusicBrainz",
};

function formatBpmKeySourceLabel(
  featuresA: TrackFeatures | null,
  featuresB: TrackFeatures | null
): string {
  const sources = [featuresA?.source, featuresB?.source].filter(
    (s): s is NonNullable<AudioAnalysisSource> => s != null
  );
  const unique = [...new Set(sources)];

  if (unique.length === 0) return "BPM & Key unavailable";
  if (unique.length === 1) return `BPM & Key via ${SOURCE_LABELS[unique[0]]}`;
  return `BPM & Key via ${unique.map((s) => SOURCE_LABELS[s]).join(" & ")}`;
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
          <div className="w-full flex justify-end">
            <Link
              href="/setlist"
              className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase text-muted-foreground hover:text-[#a855f7] transition-colors"
            >
              <ListMusic className="size-3.5" />
              Set Planner
            </Link>
          </div>
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
              Search two Spotify tracks to instantly analyze BPM, musical key, energy and compatibility — with a live Camelot wheel.
            </p>
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

        <footer className="text-center space-y-1 pb-2">
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
            Track data powered by Spotify &mdash;{" "}
            {formatBpmKeySourceLabel(analysis.featuresA, analysis.featuresB)}
          </p>
          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.15)" }}>
            <a
              href="/api/auth/spotify"
              className="underline decoration-white/10 underline-offset-2 transition-colors hover:decoration-white/25"
              style={{ color: "rgba(255,255,255,0.25)" }}
            >
              Connect Spotify
            </a>
            {" "}for recently played suggestions &middot; BPM data powered by{" "}
            <a
              href="https://getsongbpm.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-white/10 underline-offset-2 transition-colors hover:decoration-white/25"
              style={{ color: "rgba(255,255,255,0.25)" }}
            >
              GetSongBPM
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
