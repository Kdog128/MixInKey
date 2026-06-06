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
  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expires: Date.now() + data.expires_in * 1000 - 5000,
  };
  return cachedToken.token;
}

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get("ids");
  if (!ids) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  }

  try {
    const token = await getAccessToken();
    const url = `https://api.spotify.com/v1/audio-features?ids=${ids}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Features fetch failed" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json({ features: data.audio_features });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
