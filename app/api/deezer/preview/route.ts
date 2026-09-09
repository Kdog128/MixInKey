import { NextRequest, NextResponse } from "next/server";
import { fetchDeezerPreviewAudio, findDeezerPreview } from "@/lib/deezer";
import { getSpotifyToken } from "@/lib/spotify-auth";

async function resolveIsrcFromSpotify(spotifyId: string): Promise<string | null> {
  try {
    const token = await getSpotifyToken();
    const res = await fetch(
      `https://api.spotify.com/v1/tracks/${encodeURIComponent(spotifyId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(2500),
      }
    );
    if (!res.ok) {
      console.log("[deezer] Spotify ISRC lookup failed:", {
        spotifyId,
        status: res.status,
      });
      return null;
    }
    const track = (await res.json()) as { external_ids?: { isrc?: string | null } };
    return track.external_ids?.isrc?.trim() || null;
  } catch (err) {
    console.log("[deezer] Spotify ISRC lookup error:", {
      spotifyId,
      err: err instanceof Error ? err.message : err,
    });
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      title?: string;
      artist?: string;
      isrc?: string | null;
      duration_ms?: number;
      spotify_id?: string | null;
    };

    const title = body.title?.trim() ?? "";
    const artist = body.artist?.trim() ?? "";
    const spotifyId = body.spotify_id?.trim() || null;
    let isrc = body.isrc?.trim() || null;

    if (!title && !isrc) {
      return NextResponse.json({ error: "Missing title or ISRC" }, { status: 400 });
    }

    if (!isrc && spotifyId) {
      isrc = await resolveIsrcFromSpotify(spotifyId);
    }

    console.log("[deezer] Preview request:", {
      title,
      artist,
      isrc,
      isrcSource: body.isrc?.trim() ? "client" : isrc ? "spotify_track" : null,
      spotifyId,
      duration_ms: body.duration_ms ?? null,
    });

    const match = await findDeezerPreview({
      title,
      artist,
      isrc,
      duration_ms: body.duration_ms,
    });

    if (!match?.preview) {
      return NextResponse.json({ error: "No Deezer preview" }, { status: 404 });
    }

    const audio = await fetchDeezerPreviewAudio(match.preview);
    if (!audio || audio.byteLength === 0) {
      console.log("[deezer] Match rejected:", {
        reason: "preview_download_failed",
        title: match.title,
        preview: match.preview,
      });
      return NextResponse.json({ error: "Preview download failed" }, { status: 404 });
    }

    console.log("[deezer] Preview audio:", {
      spotifyId,
      deezerId: match.id,
      title: match.title,
      artist: match.artist?.name ?? null,
      previewUrl: match.preview,
      byteLength: audio.byteLength,
    });

    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Deezer-Preview-Url": match.preview,
        "X-Deezer-Title": encodeURIComponent(match.title),
        "X-Deezer-Artist": encodeURIComponent(match.artist?.name ?? ""),
        "X-Deezer-Id": String(match.id),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
