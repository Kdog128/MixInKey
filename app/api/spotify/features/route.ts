import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotify-auth";

// BPM ranges estimated from genre keywords.
// Used as a best-effort proxy since /audio-features was deprecated in 2024.
const GENRE_BPM: Array<[RegExp, number]> = [
  [/drum.?n.?bass|dnb|jungle/, 170],
  [/hardstyle|hardcore/, 160],
  [/techno|trance|psytrance/, 140],
  [/drum machine|electro|electronica/, 130],
  [/house|disco|funk/, 124],
  [/deep.?house|afro.?house/, 122],
  [/uk.?garage|garage/, 130],
  [/dubstep|trap|grime/, 140],
  [/hip.?hop|rap|r&b|rnb|neo.?soul/, 90],
  [/reggaeton|latin|salsa/, 100],
  [/reggae|dub/, 80],
  [/pop|indie.?pop|synth.?pop/, 120],
  [/rock|punk|metal|indie/, 130],
  [/jazz|blues|soul/, 100],
  [/classical|orchestral/, 90],
  [/ambient|chill|lo.?fi/, 75],
];

function estimateBpmFromGenres(genres: string[]): number | null {
  const joined = genres.join(" ").toLowerCase();
  for (const [pattern, bpm] of GENRE_BPM) {
    if (pattern.test(joined)) return bpm;
  }
  return null;
}

export interface TrackFeatures {
  popularity: number;        // 0–100 from Spotify
  duration_ms: number;
  explicit: boolean;
  genres: string[];          // from artist endpoint
  estimatedBpm: number | null;
  // These are always null now — audio-features was deprecated
  tempo: null;
  key: null;
  mode: null;
  energy: null;
  danceability: null;
  valence: null;
}

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get("ids");
  if (!ids) {
    return NextResponse.json({ error: "Missing ids parameter" }, { status: 400 });
  }

  const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
  if (idList.length === 0) {
    return NextResponse.json({ error: "No valid track IDs" }, { status: 400 });
  }

  try {
    const token = await getSpotifyToken();
    const headers = { Authorization: `Bearer ${token}` };

    // Fetch full track objects (popularity, duration_ms, explicit, artists)
    const tracksUrl = `https://api.spotify.com/v1/tracks?ids=${idList.map(encodeURIComponent).join(",")}`;
    console.log("[v0] tracks request URL:", tracksUrl);
    console.log("[v0] token prefix (first 10 chars):", token.slice(0, 10));
    const tracksRes = await fetch(tracksUrl, { headers, cache: "no-store" });
    console.log("[v0] tracks response status:", tracksRes.status);
    if (!tracksRes.ok) {
      const body = await tracksRes.text().catch(() => "");
      console.log("[v0] tracks error body:", body);
      let errMsg = `Spotify tracks fetch failed (${tracksRes.status})`;
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        if (parsed.error?.message) errMsg = parsed.error.message;
      } catch { /* ignore */ }
      return NextResponse.json({ error: errMsg }, { status: tracksRes.status });
    }
    const tracksData = await tracksRes.json() as {
      tracks: Array<{
        id: string;
        popularity: number;
        duration_ms: number;
        explicit: boolean;
        artists: Array<{ id: string; name: string }>;
      } | null>
    };

    const tracks = tracksData.tracks ?? [];

    // Collect all unique artist IDs to batch-fetch genres
    const artistIdSet = new Set<string>();
    for (const t of tracks) {
      if (t?.artists?.[0]?.id) artistIdSet.add(t.artists[0].id);
    }
    const artistIds = Array.from(artistIdSet);

    let artistGenres: Record<string, string[]> = {};
    if (artistIds.length > 0) {
      const artistsRes = await fetch(
        `https://api.spotify.com/v1/artists?ids=${artistIds.map(encodeURIComponent).join(",")}`,
        { headers, cache: "no-store" }
      );
      if (artistsRes.ok) {
        const artistsData = await artistsRes.json() as {
          artists: Array<{ id: string; genres: string[] }>;
        };
        for (const a of artistsData.artists ?? []) {
          if (a?.id) artistGenres[a.id] = a.genres ?? [];
        }
      }
    }

    const features: TrackFeatures[] = tracks.map((t) => {
      if (!t) {
        return {
          popularity: 0, duration_ms: 0, explicit: false, genres: [],
          estimatedBpm: null, tempo: null, key: null, mode: null,
          energy: null, danceability: null, valence: null,
        };
      }
      const primaryArtistId = t.artists?.[0]?.id ?? "";
      const genres = artistGenres[primaryArtistId] ?? [];
      const estimatedBpm = estimateBpmFromGenres(genres);
      return {
        popularity: t.popularity,
        duration_ms: t.duration_ms,
        explicit: t.explicit,
        genres,
        estimatedBpm,
        tempo: null,
        key: null,
        mode: null,
        energy: null,
        danceability: null,
        valence: null,
      };
    });

    return NextResponse.json({ features });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
