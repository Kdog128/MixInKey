import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotify-auth";
import { mapSpotifyTrack, type SpotifyApiTrack } from "@/lib/spotify-track";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ tracks: [] });
  }

  try {
    console.log("[spotify/search] Incoming query:", q);
    const token = await getSpotifyToken();
    const market = process.env.SPOTIFY_MARKET ?? "US";
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8&market=${encodeURIComponent(market)}`;
    console.log("[spotify/search] Calling Spotify API:", url);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const bodyText = await res.text();

    if (!res.ok) {
      console.error("[spotify/search] Search request failed:", {
        status: res.status,
        statusText: res.statusText,
        body: bodyText,
      });
      return NextResponse.json({ error: `Spotify search failed (${res.status})` }, { status: res.status });
    }

    const data = JSON.parse(bodyText);
    const rawItems = data.tracks?.items ?? [];
    console.log("[spotify/search] Search succeeded:", {
      trackCount: rawItems.length,
      tracksObject: data.tracks ? { total: data.tracks.total, limit: data.tracks.limit } : null,
    });

    const tracks = rawItems.map((t: SpotifyApiTrack) => mapSpotifyTrack(t));

    return NextResponse.json({ tracks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[spotify/search] Unhandled error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
