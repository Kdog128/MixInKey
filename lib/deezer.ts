const DEEZER_SEARCH_URL = "https://api.deezer.com/search";
const DEEZER_FETCH_MS = 8000;
const MIN_ACCEPT_SCORE = 4;

export interface DeezerSearchTrack {
  id: number;
  title: string;
  title_short?: string;
  duration: number;
  preview: string;
  isrc?: string;
  artist?: { name?: string };
}

interface DeezerSearchResponse {
  data?: DeezerSearchTrack[];
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(
      /\s+-\s+(extended(\s+mix)?|radio\s+edit|club\s+mix|original\s+mix|remix|edit)\b.*$/g,
      " "
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function primaryArtist(artist: string): string {
  return artist.split(",")[0]?.trim() ?? artist;
}

function scoreMatch(
  candidate: DeezerSearchTrack,
  title: string,
  artist: string,
  durationSec?: number
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  if (!candidate.preview?.trim()) {
    return { score: -1, reasons: ["no_preview"] };
  }

  const candTitle = normalizeName(candidate.title_short || candidate.title);
  const candArtist = normalizeName(candidate.artist?.name ?? "");
  const wantTitle = normalizeName(title);
  const wantArtist = normalizeName(primaryArtist(artist));
  let score = 0;

  if (candTitle && wantTitle && candTitle === wantTitle) score += 3;
  else if (candTitle && wantTitle && (candTitle.includes(wantTitle) || wantTitle.includes(candTitle))) {
    score += 1;
    reasons.push(
      `title_partial have="${candidate.title_short || candidate.title}" want="${title}"`
    );
  } else {
    reasons.push(
      `title_mismatch have="${candidate.title_short || candidate.title}" want="${title}"`
    );
  }

  if (candArtist && wantArtist && candArtist === wantArtist) score += 3;
  else if (candArtist && wantArtist && (candArtist.includes(wantArtist) || wantArtist.includes(candArtist))) {
    score += 1;
    reasons.push(
      `artist_partial have="${candidate.artist?.name ?? ""}" want="${artist}"`
    );
  } else {
    reasons.push(
      `artist_mismatch have="${candidate.artist?.name ?? ""}" want="${artist}"`
    );
  }

  if (durationSec != null && Number.isFinite(candidate.duration)) {
    const delta = Math.abs(candidate.duration - durationSec);
    if (delta <= 5) score += 2;
    else reasons.push(`duration_delta_sec=${delta}`);
  }

  if (score <= 0) reasons.push("score_zero");
  return { score, reasons };
}

async function searchDeezer(query: string): Promise<DeezerSearchTrack[]> {
  const url = `${DEEZER_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=8`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(DEEZER_FETCH_MS),
  });
  if (!res.ok) {
    console.warn("[deezer] Search failed:", { status: res.status, query });
    return [];
  }
  const data = (await res.json()) as DeezerSearchResponse;
  return data.data ?? [];
}

export async function findDeezerPreview(input: {
  title: string;
  artist: string;
  isrc?: string | null;
  duration_ms?: number;
}): Promise<DeezerSearchTrack | null> {
  const title = input.title.trim();
  const artist = input.artist.trim();
  const isrc = input.isrc?.trim() || null;
  const durationSec =
    input.duration_ms != null && input.duration_ms > 0
      ? input.duration_ms / 1000
      : undefined;

  const queries: string[] = [];
  if (isrc) queries.push(`isrc:${isrc}`);
  if (title && artist) queries.push(`${title} ${primaryArtist(artist)}`);
  else if (title) queries.push(title);

  console.log("[deezer] Lookup:", {
    isrc,
    title,
    artist,
    queries,
    durationSec: durationSec ?? null,
  });

  let best: DeezerSearchTrack | null = null;
  let bestScore = 0;
  let bestReasons: string[] = ["no_results"];

  for (const query of queries) {
    const results = await searchDeezer(query);
    console.log("[deezer] Search:", {
      query,
      resultCount: results.length,
      titles: results.map((item) => item.title),
    });

    if (results.length === 0) {
      console.log("[deezer] Query rejected:", { query, reason: "empty_results" });
      continue;
    }

    for (const candidate of results) {
      if (
        isrc &&
        candidate.isrc &&
        candidate.isrc.toUpperCase() === isrc.toUpperCase() &&
        candidate.preview
      ) {
        console.log("[deezer] Match accepted:", {
          query,
          reason: "isrc_exact",
          title: candidate.title,
          artist: candidate.artist?.name ?? null,
          isrc: candidate.isrc,
        });
        return candidate;
      }

      const { score, reasons } = scoreMatch(candidate, title, artist, durationSec);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
        bestReasons = reasons;
      } else {
        console.log("[deezer] Candidate rejected:", {
          query,
          title: candidate.title,
          artist: candidate.artist?.name ?? null,
          score,
          reasons,
        });
      }
    }

    if (best && bestScore >= MIN_ACCEPT_SCORE) {
      console.log("[deezer] Match accepted:", {
        query,
        reason: "score_threshold",
        score: bestScore,
        title: best.title,
        artist: best.artist?.name ?? null,
      });
      return best;
    }
  }

  if (best && bestScore > 0) {
    console.log("[deezer] Match accepted:", {
      reason: "best_positive_score",
      score: bestScore,
      title: best.title,
      artist: best.artist?.name ?? null,
      reasons: bestReasons,
    });
    return best;
  }

  console.log("[deezer] No match:", {
    isrc,
    bestScore,
    reasons: bestReasons,
  });
  return null;
}

export async function fetchDeezerPreviewAudio(previewUrl: string): Promise<ArrayBuffer | null> {
  let parsed: URL;
  try {
    parsed = new URL(previewUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".dzcdn.net")) {
    return null;
  }
  try {
    const res = await fetch(previewUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(DEEZER_FETCH_MS),
    });
    if (!res.ok) {
      console.warn("[deezer] Preview fetch failed:", { status: res.status });
      return null;
    }
    return await res.arrayBuffer();
  } catch (err) {
    console.warn("[deezer] Preview fetch error:", err);
    return null;
  }
}
