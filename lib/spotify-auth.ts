let cachedToken: { token: string; expires: number } | null = null;

export async function getSpotifyToken(): Promise<string> {
  // Always read env vars fresh inside the function — never at module level —
  // so that new values injected by the v0 sandbox are picked up without a restart.
  const CLIENT_ID = (process.env.SPOTIFY_CLIENT_ID ?? "").trim();
  const CLIENT_SECRET = (process.env.SPOTIFY_CLIENT_SECRET ?? "").trim();

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "Spotify credentials are not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in your project settings."
    );
  }

  // Return cached token if still valid (with a 30s safety buffer)
  if (cachedToken && Date.now() < cachedToken.expires - 30_000) {
    return cachedToken.token;
  }

  // Always clear stale token before a fresh request
  cachedToken = null;

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

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let errMsg = `Spotify auth failed (${res.status})`;
    try {
      const parsed = JSON.parse(body) as { error?: string; error_description?: string };
      if (parsed.error_description) errMsg = parsed.error_description;
      else if (parsed.error) errMsg = parsed.error;
    } catch {
      // ignore parse error
    }
    throw new Error(errMsg);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expires: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}
