import { NextRequest, NextResponse } from "next/server";

let cachedToken: { token: string; expires: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) {
    return cachedToken.token;
  }
  const CLIENT_ID = (process.env.SPOTIFY_CLIENT_ID ?? "").trim();
  const CLIENT_SECRET = (process.env.SPOTIFY_CLIENT_SECRET ?? "").trim();
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Spotify credentials not configured");
  }
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let parsed: Record<string, string> = {};
    try { parsed = JSON.parse(body); } catch { /* ignore */ }
    cachedToken = null; // reset so next request retries
    throw new Error(parsed.error_description ?? `Spotify auth failed: ${res.status}`);
  }
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expires: Date.now() + data.expires_in * 1000 - 5000,
  };
  return cachedToken.token;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ tracks: [] });
  }

  try {
    const token = await getAccessToken();
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Search failed" }, { status: res.status });
    }
    const data = await res.json();
    const tracks = (data.tracks?.items ?? []).map((t: SpotifyTrack) => ({
      id: t.id,
      name: t.name,
      artist: t.artists.map((a: { name: string }) => a.name).join(", "),
      album: t.album.name,
      image: t.album.images?.[1]?.url ?? t.album.images?.[0]?.url ?? null,
      preview_url: t.preview_url,
      duration_ms: t.duration_ms,
    }));
    return NextResponse.json({ tracks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  preview_url: string | null;
  duration_ms: number;
}
