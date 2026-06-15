import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotify-auth";

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

    const tracks = rawItems.map((t: SpotifyTrack) => ({
      id: t.id,
      name: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      artist_id: t.artists[0]?.id ?? null,
      album: t.album.name,
      image: t.album.images?.[1]?.url ?? t.album.images?.[0]?.url ?? null,
      preview_url: t.preview_url,
      duration_ms: t.duration_ms,
      popularity: t.popularity ?? 0,
      explicit: t.explicit ?? false,
      release_date: t.album.release_date ?? null,
    }));

    return NextResponse.json({ tracks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[spotify/search] Unhandled error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

interface SpotifyTrack {
  id: string;
  name: string;
  popularity: number;
  explicit: boolean;
  artists: { id: string; name: string }[];
  album: { name: string; release_date: string; images: { url: string }[] };
  preview_url: string | null;
  duration_ms: number;
}
