/**
 * Expected Supabase table:
 *
 * create table if not exists favorites (
 *   id uuid primary key default gen_random_uuid(),
 *   client_id text not null,
 *   spotify_id text not null,
 *   name text,
 *   artist text,
 *   bpm integer,
 *   musical_key text,
 *   camelot text,
 *   image text,
 *   saved_at timestamptz default now(),
 *   unique (client_id, spotify_id)
 * );
 *
 * alter table favorites add column if not exists client_id text;
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import {
  isMissingClientIdColumnError,
  readVisitorClientId,
} from "@/lib/visitor-id";

interface FavoriteRow {
  client_id: string;
  spotify_id: string;
  name: string | null;
  artist: string | null;
  bpm: number | null;
  musical_key: string | null;
  camelot: string | null;
  image: string | null;
  saved_at: string | null;
}

function isMissingFavoritesTable(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("favorites") && lower.includes("does not exist");
}

function isFavoritesSchemaError(message: string | undefined): boolean {
  return isMissingFavoritesTable(message) || isMissingClientIdColumnError(message);
}

function parseTrack(raw: unknown): FavoriteRow | null {
  if (!raw || typeof raw !== "object") return null;
  const track = raw as Record<string, unknown>;
  const spotifyId = typeof track.spotify_id === "string" ? track.spotify_id.trim() : "";
  if (!spotifyId) return null;
  const bpm =
    typeof track.bpm === "number" && Number.isFinite(track.bpm) ? track.bpm : null;
  const savedAt =
    typeof track.saved_at === "string" && track.saved_at.trim()
      ? track.saved_at
      : new Date().toISOString();

  return {
    client_id: "",
    spotify_id: spotifyId,
    name: typeof track.name === "string" ? track.name : "",
    artist: typeof track.artist === "string" ? track.artist : "",
    bpm,
    musical_key:
      typeof track.key === "string"
        ? track.key
        : typeof track.musical_key === "string"
          ? track.musical_key
          : null,
    camelot: typeof track.camelot === "string" ? track.camelot : null,
    image: typeof track.image === "string" ? track.image.trim() || null : null,
    saved_at: savedAt,
  };
}

function toClientTrack(row: FavoriteRow) {
  return {
    spotify_id: row.spotify_id,
    name: row.name ?? "",
    artist: row.artist ?? "",
    bpm: row.bpm,
    key: row.musical_key,
    camelot: row.camelot,
    image: row.image,
    saved_at: row.saved_at ?? new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const clientId = readVisitorClientId(request);
  if (!clientId) {
    return NextResponse.json({ tracks: [] });
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ tracks: [] });
  }

  try {
    const { data, error } = await supabase
      .from("favorites")
      .select("spotify_id, name, artist, bpm, musical_key, camelot, image, saved_at")
      .eq("client_id", clientId)
      .order("saved_at", { ascending: false });

    if (error) {
      if (isFavoritesSchemaError(error.message)) {
        console.warn("[favorites] table or client_id column is missing — run the migration");
        return NextResponse.json({ tracks: [] });
      }
      console.warn("[favorites] Read failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const tracks = ((data ?? []) as FavoriteRow[]).map(toClientTrack);
    return NextResponse.json({ tracks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[favorites] GET error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { tracks?: unknown; client_id?: unknown };
    const clientId = readVisitorClientId(request, body.client_id);
    if (!clientId) {
      return NextResponse.json({ error: "Missing client_id" }, { status: 400 });
    }

    const parsed = Array.isArray(body.tracks)
      ? body.tracks.map(parseTrack).filter((row): row is FavoriteRow => row != null)
      : [];

    const seen = new Set<string>();
    const rows = parsed
      .filter((row) => {
        if (seen.has(row.spotify_id)) return false;
        seen.add(row.spotify_id);
        return true;
      })
      .map((row) => ({ ...row, client_id: clientId }));

    const { error: deleteError } = await supabase
      .from("favorites")
      .delete()
      .eq("client_id", clientId);

    if (deleteError) {
      if (isFavoritesSchemaError(deleteError.message)) {
        console.warn("[favorites] table or client_id column is missing — run the migration");
        return NextResponse.json({ error: "Favorites table is not set up yet" }, { status: 503 });
      }
      console.warn("[favorites] Delete failed:", deleteError.message);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("favorites").insert(rows);
      if (insertError) {
        console.warn("[favorites] Insert failed:", insertError.message);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[favorites] PUT error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
