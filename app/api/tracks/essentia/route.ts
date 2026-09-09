import { NextRequest, NextResponse } from "next/server";
import { parseMusicalKeyString } from "@/lib/camelot";
import { markEssentiaResolved, saveCachedTrackAnalysis } from "@/lib/tracks-cache";
import type { AudioAnalysis } from "@/lib/audio-analysis";

const emptyFail: AudioAnalysis = {
  bpm: null,
  musicalKey: null,
  camelot: null,
  source: null,
  popularity: null,
  genres: [],
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      spotify_id?: string;
      artist?: string;
      title?: string;
      artwork_url?: string | null;
      bpm?: number | null;
      musical_key?: string | null;
      failed?: boolean;
    };

    const spotifyId = body.spotify_id?.trim();
    if (!spotifyId) {
      return NextResponse.json({ error: "Missing spotify_id" }, { status: 400 });
    }

    const track = {
      spotify_id: spotifyId,
      artist: body.artist?.trim() ?? "",
      title: body.title?.trim() ?? "",
      artwork_url: body.artwork_url ?? null,
    };

    if (body.failed) {
      await saveCachedTrackAnalysis(track, emptyFail, {
        completedLookup: true,
        essentiaAttempted: true,
      });
      return NextResponse.json({ ok: true, cached: "negative" });
    }

    const bpm = typeof body.bpm === "number" && Number.isFinite(body.bpm) ? Math.round(body.bpm) : null;
    const musicalKey = body.musical_key?.trim() || null;
    const camelot = musicalKey ? parseMusicalKeyString(musicalKey) : null;

    if (bpm == null || !musicalKey || !camelot) {
      await saveCachedTrackAnalysis(track, emptyFail, {
        completedLookup: true,
        essentiaAttempted: true,
      });
      return NextResponse.json({ ok: true, cached: "negative" });
    }

    const analysis: AudioAnalysis = {
      bpm,
      musicalKey: camelot.musicalKey ?? musicalKey,
      camelot,
      source: "essentia",
      popularity: null,
      genres: [],
    };

    markEssentiaResolved(spotifyId);
    await saveCachedTrackAnalysis(track, analysis, { completedLookup: true });
    return NextResponse.json({ ok: true, cached: "essentia", analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
