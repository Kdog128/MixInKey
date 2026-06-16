import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotify-auth";
import { mapSpotifyTrack, type SpotifyApiTrack } from "@/lib/spotify-track";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getCachedTracksAnalysis, type TracksCacheRow } from "@/lib/tracks-cache";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface SetlistTrackRow {
  spotify_id: string;
  position: number;
}

async function fetchSpotifyTracksByIds(
  ids: string[]
): Promise<Map<string, ReturnType<typeof mapSpotifyTrack>>> {
  const result = new Map<string, ReturnType<typeof mapSpotifyTrack>>();
  if (ids.length === 0) return result;

  try {
    const token = await getSpotifyToken();
    const headers = { Authorization: `Bearer ${token}` };

    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const url = `https://api.spotify.com/v1/tracks?ids=${batch.map(encodeURIComponent).join(",")}`;
      const res = await fetch(url, { headers, cache: "no-store" });

      if (!res.ok) {
        console.warn("[setlists/id] Spotify tracks fetch failed:", res.status);
        continue;
      }

      const data = (await res.json()) as { tracks: Array<SpotifyApiTrack | null> };
      for (const track of data.tracks ?? []) {
        if (track?.id) {
          result.set(track.id, mapSpotifyTrack(track));
        }
      }
    }
  } catch (err) {
    console.warn("[setlists/id] Spotify tracks fetch error:", err);
  }

  return result;
}

async function fetchCacheRowsByIds(
  ids: string[]
): Promise<Map<string, TracksCacheRow>> {
  const result = new Map<string, TracksCacheRow>();
  if (ids.length === 0) return result;

  const supabase = createSupabaseServerClient();
  if (!supabase) return result;

  const { data, error } = await supabase
    .from("tracks_cache")
    .select("spotify_id, artist, title, bpm, musical_key, camelot_label, artwork_url")
    .in("spotify_id", ids);

  if (error) {
    console.warn("[setlists/id] Cache metadata fetch failed:", error.message);
    return result;
  }

  for (const row of (data ?? []) as TracksCacheRow[]) {
    result.set(row.spotify_id, row);
  }

  return result;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Setlist ID is required" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    const { data: setlist, error: setlistError } = await supabase
      .from("setlists")
      .select("id, name, created_at")
      .eq("id", id)
      .maybeSingle();

    if (setlistError) {
      console.error("[setlists/id] Fetch failed:", setlistError);
      return NextResponse.json({ error: setlistError.message }, { status: 500 });
    }
    if (!setlist) {
      return NextResponse.json({ error: "Setlist not found" }, { status: 404 });
    }

    const { data: trackRows, error: tracksError } = await supabase
      .from("setlist_tracks")
      .select("spotify_id, position")
      .eq("setlist_id", id)
      .order("position", { ascending: true });

    if (tracksError) {
      console.error("[setlists/id] Tracks fetch failed:", tracksError);
      return NextResponse.json({ error: tracksError.message }, { status: 500 });
    }

    const rows = (trackRows ?? []) as SetlistTrackRow[];
    const spotifyIds = rows.map((row) => row.spotify_id);

    const [cacheAnalysisById, cacheRowsById, spotifyById] = await Promise.all([
      getCachedTracksAnalysis(spotifyIds),
      fetchCacheRowsByIds(spotifyIds),
      fetchSpotifyTracksByIds(spotifyIds),
    ]);

    const tracks = rows.map((row) => {
      const cached = cacheAnalysisById.get(row.spotify_id);
      const cacheRow = cacheRowsById.get(row.spotify_id);
      const spotify = spotifyById.get(row.spotify_id);

      return {
        spotify_id: row.spotify_id,
        position: row.position,
        name: spotify?.name ?? cacheRow?.title ?? "Unknown Track",
        artist: spotify?.artist ?? cacheRow?.artist ?? "Unknown Artist",
        album: spotify?.album ?? "",
        image: spotify?.image ?? cacheRow?.artwork_url ?? null,
        bpm: cached?.bpm ?? cacheRow?.bpm ?? null,
        musical_key: cached?.musicalKey ?? cacheRow?.musical_key ?? null,
        camelot_label: cached?.camelot?.label ?? cacheRow?.camelot_label ?? null,
        duration_ms: spotify?.duration_ms ?? 0,
      };
    });

    return NextResponse.json({
      id: setlist.id,
      name: setlist.name,
      created_at: setlist.created_at,
      tracks,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Setlist ID is required" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    const { error } = await supabase.from("setlists").delete().eq("id", id);

    if (error) {
      console.error("[setlists/id] Delete failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
