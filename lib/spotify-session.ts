import { cookies } from "next/headers";

const ACCESS_TOKEN_COOKIE = "spotify_access_token";
const REFRESH_TOKEN_COOKIE = "spotify_refresh_token";
const EXPIRES_AT_COOKIE = "spotify_token_expires_at";
const OAUTH_STATE_COOKIE = "spotify_oauth_state";

const SPOTIFY_SCOPES = "user-read-recently-played";

function getSpotifyCredentials() {
  const clientId = (process.env.SPOTIFY_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.SPOTIFY_CLIENT_SECRET ?? "").trim();
  const redirectUri = (process.env.SPOTIFY_REDIRECT_URI ?? "").trim();
  return { clientId, clientSecret, redirectUri };
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function exchangeToken(body: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getSpotifyCredentials();
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("[spotify-session] Token exchange failed:", { status: res.status, body: text });
    throw new Error("Spotify token exchange failed");
  }

  return JSON.parse(text) as TokenResponse;
}

export async function setUserTokens(data: TokenResponse): Promise<void> {
  const cookieStore = await cookies();
  const expiresAt = Date.now() + data.expires_in * 1000;

  cookieStore.set(ACCESS_TOKEN_COOKIE, data.access_token, cookieOptions(data.expires_in));
  cookieStore.set(EXPIRES_AT_COOKIE, String(expiresAt), cookieOptions(data.expires_in));

  if (data.refresh_token) {
    cookieStore.set(REFRESH_TOKEN_COOKIE, data.refresh_token, cookieOptions(60 * 60 * 24 * 30));
  }
}

export async function clearUserTokens(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
  cookieStore.delete(EXPIRES_AT_COOKIE);
}

export async function createOAuthState(): Promise<string> {
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, cookieOptions(600));
  return state;
}

export async function verifyOAuthState(state: string | null): Promise<boolean> {
  if (!state) return false;
  const cookieStore = await cookies();
  const stored = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);
  return stored === state;
}

export function buildSpotifyAuthUrl(state: string): string {
  const { clientId, redirectUri } = getSpotifyCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: "false",
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeAuthorizationCode(code: string): Promise<TokenResponse> {
  const { redirectUri } = getSpotifyCredentials();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  }).toString();
  return exchangeToken(body);
}

async function refreshUserAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }).toString();
  return exchangeToken(body);
}

export async function getUserAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  const expiresAt = Number(cookieStore.get(EXPIRES_AT_COOKIE)?.value ?? 0);

  if (!accessToken) return null;

  if (expiresAt > Date.now() + 30_000) {
    return accessToken;
  }

  if (!refreshToken) {
    await clearUserTokens();
    return null;
  }

  try {
    const refreshed = await refreshUserAccessToken(refreshToken);
    await setUserTokens({ ...refreshed, refresh_token: refreshed.refresh_token ?? refreshToken });
    return refreshed.access_token;
  } catch {
    await clearUserTokens();
    return null;
  }
}
