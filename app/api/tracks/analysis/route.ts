import { NextRequest, NextResponse } from "next/server";
import { getCachedTrackRowsByIds } from "@/lib/tracks-cache";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { spotify_ids?: string[] };
    const spotifyIds = body.spotify_ids ?? [];
    const rowsById = await getCachedTrackRowsByIds(spotifyIds);

    const tracks = Object.fromEntries(
      [...rowsById.entries()].map(([id, row]) => [
        id,
        {
          bpm: row.bpm,
          musical_key: row.musical_key,
          camelot_label: row.camelot_label,
        },
      ])
    );

    return NextResponse.json({ tracks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
