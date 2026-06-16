import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getCachedTracksAnalysis } from "@/lib/tracks-cache";
import { resolveTrackMetadataByIds } from "@/lib/track-metadata";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface SetlistTrackRow {
  spotify_id: string;
  position: number;
}

interface UpdateSetlistBody {
  name?: string;
  tracks?: SetlistTrackRow[];
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

    const [cacheAnalysisById, metadataById] = await Promise.all([
      getCachedTracksAnalysis(spotifyIds),
      resolveTrackMetadataByIds(spotifyIds),
    ]);

    const tracks = rows.map((row) => {
      const cached = cacheAnalysisById.get(row.spotify_id);
      const metadata = metadataById.get(row.spotify_id);

      return {
        spotify_id: row.spotify_id,
        position: row.position,
        name: metadata?.name ?? "Unknown Track",
        artist: metadata?.artist ?? "Unknown Artist",
        album: metadata?.album ?? "",
        image: metadata?.image ?? null,
        bpm: cached?.bpm ?? null,
        original_bpm: cached?.bpm ?? null,
        musical_key: cached?.musicalKey ?? null,
        camelot_label: cached?.camelot?.label ?? null,
        duration_ms: metadata?.duration_ms ?? 0,
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

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const setlistId = id?.trim();

    if (!setlistId) {
      return NextResponse.json({ error: "Setlist ID is required" }, { status: 400 });
    }

    const body = (await request.json()) as UpdateSetlistBody;
    const name = body.name?.trim();
    const tracks = body.tracks ?? [];

    if (!name) {
      return NextResponse.json({ error: "Setlist name is required" }, { status: 400 });
    }
    if (tracks.length === 0) {
      return NextResponse.json({ error: "At least one track is required" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("setlists")
      .select("id")
      .eq("id", setlistId)
      .maybeSingle();

    if (fetchError) {
      console.error("[setlists/id] PUT fetch failed:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Setlist not found" }, { status: 404 });
    }

    const { error: updateError } = await supabase
      .from("setlists")
      .update({ name })
      .eq("id", setlistId);

    if (updateError) {
      console.error("[setlists/id] PUT name update failed:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { error: tracksDeleteError } = await supabase
      .from("setlist_tracks")
      .delete()
      .eq("setlist_id", setlistId);

    if (tracksDeleteError) {
      console.error("[setlists/id] PUT tracks delete failed:", tracksDeleteError);
      return NextResponse.json({ error: tracksDeleteError.message }, { status: 500 });
    }

    const rows = tracks.map((track) => ({
      setlist_id: setlistId,
      spotify_id: track.spotify_id,
      position: track.position,
    }));

    const { error: tracksInsertError } = await supabase.from("setlist_tracks").insert(rows);

    if (tracksInsertError) {
      console.error("[setlists/id] PUT tracks insert failed:", tracksInsertError);
      return NextResponse.json({ error: tracksInsertError.message }, { status: 500 });
    }

    return NextResponse.json({ id: setlistId, name, trackCount: tracks.length, updated: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const setlistId = id?.trim();

    console.log("[setlists/id] DELETE request received for setlist ID:", setlistId);

    if (!setlistId) {
      return NextResponse.json({ error: "Setlist ID is required" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    if (!supabase) {
      console.error("[setlists/id] DELETE failed: Supabase server client not configured");
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("setlists")
      .select("id, name")
      .eq("id", setlistId)
      .maybeSingle();

    console.log("[setlists/id] DELETE pre-check:", { setlistId, existing, fetchError });

    if (fetchError) {
      console.error("[setlists/id] DELETE fetch failed:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!existing) {
      console.warn("[setlists/id] DELETE setlist not found:", setlistId);
      return NextResponse.json({ error: "Setlist not found" }, { status: 404 });
    }

    const { data: deletedTracks, error: tracksDeleteError } = await supabase
      .from("setlist_tracks")
      .delete()
      .eq("setlist_id", setlistId)
      .select("id");

    console.log("[setlists/id] DELETE setlist_tracks result:", {
      setlistId,
      deletedTrackCount: deletedTracks?.length ?? 0,
      tracksDeleteError,
    });

    if (tracksDeleteError) {
      console.error("[setlists/id] DELETE setlist_tracks failed:", tracksDeleteError);
      return NextResponse.json({ error: tracksDeleteError.message }, { status: 500 });
    }

    const { data: deletedSetlist, error: setlistDeleteError } = await supabase
      .from("setlists")
      .delete()
      .eq("id", setlistId)
      .select("id, name");

    console.log("[setlists/id] DELETE setlists result:", {
      setlistId,
      deletedSetlist,
      setlistDeleteError,
    });

    if (setlistDeleteError) {
      console.error("[setlists/id] DELETE setlists failed:", setlistDeleteError);
      return NextResponse.json({ error: setlistDeleteError.message }, { status: 500 });
    }

    if (!deletedSetlist?.length) {
      console.warn("[setlists/id] DELETE completed but no setlist row removed:", setlistId);
      return NextResponse.json({ error: "Setlist could not be deleted" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      id: deletedSetlist[0].id,
      name: deletedSetlist[0].name,
      deletedTrackCount: deletedTracks?.length ?? 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[setlists/id] DELETE unexpected error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
