import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotify-auth";
import {
  mapSpotifyTrack,
  type SpotifyApiTrack,
  type SpotifyTrackResult,
} from "@/lib/spotify-track";

interface ITunesSearchResult {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
  isrcCode?: string;
}

interface ITunesSearchResponse {
  results?: ITunesSearchResult[];
}

function mapITunesTrack(
  track: ITunesSearchResult
): SpotifyTrackResult & { spotify_id: null } {
  return {
    id: String(track.trackId),
    name: track.trackName,
    artist: track.artistName,
    artist_id: null,
    album: track.collectionName,
    image: track.artworkUrl100
      ? track.artworkUrl100.replace("100x100", "640x640")
      : null,
    preview_url: null,
    duration_ms: track.trackTimeMillis ?? 0,
    popularity: 0,
    explicit: false,
    release_date: null,
    isrc: track.isrcCode?.trim() || null,
    spotify_id: null,
  };
}

async function searchITunes(query: string): Promise<SpotifyTrackResult[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=8`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    console.error("[search] iTunes fallback request failed:", {
      status: res.status,
      statusText: res.statusText,
    });
    return [];
  }

  const data = (await res.json()) as ITunesSearchResponse;
  const rawResults = (data.results ?? []).slice(0, 8);

  if (rawResults.length > 0) {
    console.log("[search] iTunes raw track sample:", rawResults[0]);
  }

  return rawResults.map(mapITunesTrack);
}

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

      if (res.status === 429) {
        console.log("[search] Falling back to iTunes due to Spotify 429");
        const tracks = await searchITunes(q);
        return NextResponse.json(
          { tracks },
          { headers: { "x-source": "itunes" } }
        );
      }

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
