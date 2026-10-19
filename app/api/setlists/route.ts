import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import {
  isMissingClientIdColumnError,
  readVisitorClientId,
} from "@/lib/visitor-id";

interface SaveSetlistTrackInput {
  spotify_id: string;
  position: number;
}

interface SaveSetlistBody {
  name?: string;
  tracks?: SaveSetlistTrackInput[];
}

/**
 * Expected Supabase tables:
 *
 * create table setlists (
 *   id uuid primary key default gen_random_uuid(),
 *   name text not null,
 *   created_at timestamptz default now(),
 *   client_id text
 * );
 *
 * alter table setlists add column if not exists client_id text;
 *
 * -- After you have your browser's client_id (localStorage dj-companion-client-id):
 * -- update setlists set client_id = '<your-client-id>' where client_id is null;
 *
 * -- Optional: set ORPHAN_SETLISTS_OWNER_CLIENT_ID to that same id to auto-claim
 * -- leftover null rows on your next Set Planner load.
 *
 * create table setlist_tracks (
 *   id uuid primary key default gen_random_uuid(),
 *   setlist_id uuid references setlists(id) on delete cascade,
 *   spotify_id text not null,
 *   position integer not null
 * );
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SaveSetlistBody;
    const name = body.name?.trim();
    const tracks = body.tracks ?? [];
    const clientId = readVisitorClientId(request);

    if (!clientId) {
      return NextResponse.json({ error: "Missing client_id" }, { status: 400 });
    }

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

    const { data: setlist, error: setlistError } = await supabase
      .from("setlists")
      .insert({
        name,
        created_at: new Date().toISOString(),
        client_id: clientId,
      })
      .select("id")
      .single();

    if (setlistError || !setlist) {
      if (isMissingClientIdColumnError(setlistError?.message)) {
        console.warn("[setlists] client_id column is missing — run the migration");
        return NextResponse.json(
          { error: "Setlists are not set up for per-visitor access yet" },
          { status: 503 }
        );
      }
      console.error("[setlists] Insert failed:", setlistError);
      return NextResponse.json(
        { error: setlistError?.message ?? "Failed to create setlist" },
        { status: 500 }
      );
    }

    const rows = tracks.map((track) => ({
      setlist_id: setlist.id,
      spotify_id: track.spotify_id,
      position: track.position,
    }));

    const { error: tracksError } = await supabase.from("setlist_tracks").insert(rows);

    if (tracksError) {
      console.error("[setlists] Tracks insert failed:", tracksError);
      return NextResponse.json({ error: tracksError.message }, { status: 500 });
    }

    return NextResponse.json({ id: setlist.id, name, trackCount: tracks.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const clientId = readVisitorClientId(request);
    if (!clientId) {
      return NextResponse.json({ setlists: [] });
    }

    const supabase = createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    const ownerClientId = process.env.ORPHAN_SETLISTS_OWNER_CLIENT_ID?.trim();
    if (ownerClientId && ownerClientId === clientId) {
      const { error: claimError } = await supabase
        .from("setlists")
        .update({ client_id: clientId })
        .is("client_id", null);
      if (claimError && !isMissingClientIdColumnError(claimError.message)) {
        console.warn("[setlists] Orphan claim failed:", claimError.message);
      }
    }

    const { data, error } = await supabase
      .from("setlists")
      .select("id, name, created_at, setlist_tracks(count)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingClientIdColumnError(error.message)) {
        console.warn("[setlists] client_id column is missing — run the migration");
        return NextResponse.json({ setlists: [] });
      }
      console.error("[setlists] List failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const setlists = (data ?? []).map((row) => {
      const countEntry = row.setlist_tracks as unknown as { count: number }[] | null;
      return {
        id: row.id as string,
        name: row.name as string,
        created_at: row.created_at as string,
        track_count: countEntry?.[0]?.count ?? 0,
      };
    });

    return NextResponse.json({ setlists });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
