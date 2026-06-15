import { NextResponse } from "next/server";
import { getUserAccessToken } from "@/lib/spotify-session";
import { mapSpotifyTrack, type SpotifyApiTrack } from "@/lib/spotify-track";

export async function GET() {
  try {
    const token = await getUserAccessToken();
    if (!token) {
      return NextResponse.json({ tracks: [], authenticated: false }, { status: 401 });
    }

    const res = await fetch(
      "https://api.spotify.com/v1/me/player/recently-played?limit=8",
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );

    if (res.status === 401) {
      return NextResponse.json({ tracks: [], authenticated: false }, { status: 401 });
    }

    const bodyText = await res.text();
    if (!res.ok) {
      console.error("[spotify/recently-played] Request failed:", {
        status: res.status,
        body: bodyText,
      });
      return NextResponse.json(
        { error: `Recently played fetch failed (${res.status})` },
        { status: res.status }
      );
    }

    const data = JSON.parse(bodyText) as {
      items?: Array<{ track?: SpotifyApiTrack | null }>;
    };

    const seen = new Set<string>();
    const tracks = [];

    for (const item of data.items ?? []) {
      const track = item.track;
      if (!track?.id || seen.has(track.id)) continue;
      seen.add(track.id);
      tracks.push(mapSpotifyTrack(track));
      if (tracks.length >= 8) break;
    }

    return NextResponse.json({ tracks, authenticated: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[spotify/recently-played] Unhandled error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
