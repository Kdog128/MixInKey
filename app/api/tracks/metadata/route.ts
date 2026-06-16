import { NextRequest, NextResponse } from "next/server";
import { resolveTrackMetadataByIds } from "@/lib/track-metadata";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { spotify_ids?: string[] };
    const spotifyIds = body.spotify_ids ?? [];
    const metadataById = await resolveTrackMetadataByIds(spotifyIds);

    const tracks = Object.fromEntries(
      [...metadataById.entries()].map(([id, meta]) => [
        id,
        {
          image: meta.image,
          name: meta.name,
          artist: meta.artist,
          album: meta.album,
          duration_ms: meta.duration_ms,
        },
      ])
    );

    return NextResponse.json({ tracks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
