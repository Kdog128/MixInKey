import { NextResponse } from "next/server";
import { buildSpotifyAuthUrl, createOAuthState } from "@/lib/spotify-session";

export async function GET() {
  const clientId = (process.env.SPOTIFY_CLIENT_ID ?? "").trim();
  const redirectUri = (process.env.SPOTIFY_REDIRECT_URI ?? "").trim();

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Spotify OAuth is not configured" },
      { status: 500 }
    );
  }

  const state = await createOAuthState();
  const authUrl = buildSpotifyAuthUrl(state);
  return NextResponse.redirect(authUrl);
}
