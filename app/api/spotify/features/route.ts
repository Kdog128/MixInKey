import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotify-auth";

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get("ids");
  if (!ids) {
    return NextResponse.json({ error: "Missing ids parameter" }, { status: 400 });
  }

  try {
    const token = await getSpotifyToken();
    const url = `https://api.spotify.com/v1/audio-features?ids=${encodeURIComponent(ids)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let errMsg = `Spotify audio features failed (${res.status})`;
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        if (parsed.error?.message) errMsg = parsed.error.message;
      } catch {
        // ignore parse error
      }
      return NextResponse.json({ error: errMsg }, { status: res.status });
    }

    const data = await res.json();
    const features: SpotifyAudioFeatures[] = data.audio_features ?? [];

    // Spotify returns null entries for tracks with no audio features (e.g. podcasts)
    if (features.some((f) => f === null)) {
      return NextResponse.json(
        { error: "One or more tracks don't have audio features available on Spotify. Try a different track." },
        { status: 422 }
      );
    }

    return NextResponse.json({ features });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

interface SpotifyAudioFeatures {
  tempo: number;
  key: number;
  mode: number;
  energy: number;
  danceability: number;
  valence: number;
  loudness: number;
}
