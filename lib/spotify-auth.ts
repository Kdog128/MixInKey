let cachedToken: { token: string; expires: number } | null = null;

export async function getSpotifyToken(): Promise<string> {
  // Always read env vars fresh inside the function — never at module level —
  // so that new values injected by the v0 sandbox are picked up without a restart.
  const CLIENT_ID = (process.env.SPOTIFY_CLIENT_ID ?? "").trim();
  const CLIENT_SECRET = (process.env.SPOTIFY_CLIENT_SECRET ?? "").trim();

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("[spotify-auth] Missing credentials:", {
      hasClientId: Boolean(CLIENT_ID),
      hasClientSecret: Boolean(CLIENT_SECRET),
    });
    throw new Error(
      "Spotify credentials are not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in your project settings."
    );
  }

  // Return cached token if still valid (with a 30s safety buffer)
  if (cachedToken && Date.now() < cachedToken.expires - 30_000) {
    console.log("[spotify-auth] Using cached token");
    return cachedToken.token;
  }

  // Always clear stale token before a fresh request
  cachedToken = null;

  console.log("[spotify-auth] Requesting new access token...");
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    // Prevent Next.js from caching this POST request
    cache: "no-store",
  });

  const bodyText = await res.text().catch(() => "");

  if (!res.ok) {
    console.error("[spotify-auth] Token request failed:", {
      status: res.status,
      statusText: res.statusText,
      body: bodyText,
    });
    let errMsg = `Spotify auth failed (${res.status})`;
    try {
      const parsed = JSON.parse(bodyText) as { error?: string; error_description?: string };
      if (parsed.error_description) errMsg = parsed.error_description;
      else if (parsed.error) errMsg = parsed.error;
    } catch {
      // ignore parse error
    }
    throw new Error(errMsg);
  }

  const data = JSON.parse(bodyText) as { access_token: string; expires_in: number };
  console.log("[spotify-auth] Token request succeeded:", {
    expiresIn: data.expires_in,
    tokenPreview: `${data.access_token.slice(0, 8)}...`,
  });
  cachedToken = {
    token: data.access_token,
    expires: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}
