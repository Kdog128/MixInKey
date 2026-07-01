import { NextRequest, NextResponse } from "next/server";
import {
  getKeyCompatibility,
  parseMusicalKeyString,
  type CamelotKey,
  type KeyCompatibility,
} from "@/lib/camelot";
import { fetchLastFmSimilarTracks } from "@/lib/lastfm";
import { fetchReccoBeatsBySpotifyIds } from "@/lib/reccobeats";
import { getSpotifyToken } from "@/lib/spotify-auth";
import { fetchSoundNetAnalysis } from "@/lib/soundnet";
import { mapSpotifyTrack, type SpotifyApiTrack } from "@/lib/spotify-track";
import { resolveTrackMetadataByIds } from "@/lib/track-metadata";
import { getCachedTrackAnalysis, getCachedTracksAnalysis } from "@/lib/tracks-cache";

interface BridgeInputTrack {
  spotify_id: string;
  camelot: string;
  bpm: number;
}

interface BridgeTrackResult {
  spotify_id: string;
  name: string;
  artist: string;
  image: string | null;
  bpm: number | null;
  camelot: string;
  compatWithTrack1: KeyCompatibility;
  compatWithTrack2: KeyCompatibility;
}

interface ScoredBridge extends BridgeTrackResult {
  sortScore: number;
}

const MIN_BRIDGE_POPULARITY = 25;
const MAX_PARALLEL_ANALYSIS = 2;
const CANDIDATE_LOOKUP_TIMEOUT_MS = 6000;

interface BridgeCandidateAnalysis {
  bpm: number | null;
  camelot: CamelotKey | null;
}

function hasBridgeKeyData(analysis: BridgeCandidateAnalysis): boolean {
  return analysis.camelot != null || analysis.bpm != null;
}

async function lookupBridgeCandidateFromExternal(
  spotifyId: string
): Promise<BridgeCandidateAnalysis> {
  const reccoMap = await fetchReccoBeatsBySpotifyIds([spotifyId]);
  const recco = reccoMap.get(spotifyId)?.analysis;
  if (recco && hasBridgeKeyData(recco)) {
    return { bpm: recco.bpm, camelot: recco.camelot };
  }

  const soundnet = await fetchSoundNetAnalysis(spotifyId);
  if (hasBridgeKeyData(soundnet)) {
    return { bpm: soundnet.bpm, camelot: soundnet.camelot };
  }

  return { bpm: null, camelot: null };
}

async function resolveBridgeCandidateAnalysis(
  spotifyId: string
): Promise<BridgeCandidateAnalysis> {
  const cached = await getCachedTrackAnalysis(spotifyId);
  if (cached && hasBridgeKeyData(cached)) {
    return { bpm: cached.bpm, camelot: cached.camelot };
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timed = Promise.race([
    lookupBridgeCandidateFromExternal(spotifyId),
    new Promise<BridgeCandidateAnalysis>((resolve) => {
      timeoutId = setTimeout(
        () => resolve({ bpm: null, camelot: null }),
        CANDIDATE_LOOKUP_TIMEOUT_MS
      );
    }),
  ]);

  try {
    return await timed;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function parseInputTrack(
  raw: unknown,
  label: "track1" | "track2"
): BridgeInputTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const track = raw as Record<string, unknown>;
  const spotifyId = typeof track.spotify_id === "string" ? track.spotify_id.trim() : "";
  const camelot = typeof track.camelot === "string" ? track.camelot.trim() : "";
  const bpm = typeof track.bpm === "number" && Number.isFinite(track.bpm) ? track.bpm : null;

  if (!spotifyId || !camelot || bpm == null) {
    console.warn(`[bridge] Invalid ${label} input`);
    return null;
  }

  return { spotify_id: spotifyId, camelot, bpm };
}

function isNonIncompatibleWithTrack(
  candidateKey: CamelotKey,
  trackKey: CamelotKey
): KeyCompatibility {
  return getKeyCompatibility(candidateKey, trackKey);
}

function isCompatibleWithBoth(
  candidateKey: CamelotKey,
  track1Key: CamelotKey,
  track2Key: CamelotKey
): { pass: boolean; compat1: KeyCompatibility; compat2: KeyCompatibility } {
  const compat1 = isNonIncompatibleWithTrack(candidateKey, track1Key);
  const compat2 = isNonIncompatibleWithTrack(candidateKey, track2Key);
  return {
    pass: compat1.type !== "incompatible" && compat2.type !== "incompatible",
    compat1,
    compat2,
  };
}

interface ResolvedCandidate {
  spotify_id: string;
  name: string;
  artist: string;
  image: string | null;
  bpm: number | null;
  camelot: CamelotKey;
}

function toBridgeTrackResult(
  candidate: ResolvedCandidate,
  track1Key: CamelotKey,
  track2Key: CamelotKey
): BridgeTrackResult {
  const compatWithTrack1 = isNonIncompatibleWithTrack(candidate.camelot, track1Key);
  const compatWithTrack2 = isNonIncompatibleWithTrack(candidate.camelot, track2Key);

  return {
    spotify_id: candidate.spotify_id,
    name: candidate.name,
    artist: candidate.artist,
    image: candidate.image,
    bpm: candidate.bpm,
    camelot: candidate.camelot.label,
    compatWithTrack1,
    compatWithTrack2,
  };
}

async function resolveSpotifyCandidates(
  candidates: SpotifyApiTrack[],
  excludeIds: Set<string>
): Promise<ResolvedCandidate[]> {
  const eligible = candidates.filter((raw) => raw?.id && !excludeIds.has(raw.id));
  if (eligible.length === 0) return [];

  const cacheMap = await getCachedTracksAnalysis(eligible.map((track) => track.id));
  const resolved: ResolvedCandidate[] = [];
  const needsAnalysis: Array<{
    raw: SpotifyApiTrack;
    mapped: ReturnType<typeof mapSpotifyTrack>;
  }> = [];

  for (const raw of eligible) {
    const mapped = mapSpotifyTrack(raw);
    const cached = cacheMap.get(raw.id);
    const cachedCamelot = cached?.camelot ?? null;

    if (cachedCamelot) {
      resolved.push({
        spotify_id: raw.id,
        name: mapped.name,
        artist: mapped.artist,
        image: mapped.image,
        bpm: cached?.bpm ?? null,
        camelot: cachedCamelot,
      });
      continue;
    }

    needsAnalysis.push({ raw, mapped });
  }

  const toAnalyze = needsAnalysis.slice(0, MAX_PARALLEL_ANALYSIS);
  const analyzed = await Promise.all(
    toAnalyze.map(async ({ raw, mapped }) => {
      const analysis = await resolveBridgeCandidateAnalysis(raw.id);
      return { raw, mapped, bpm: analysis.bpm, camelot: analysis.camelot };
    })
  );

  for (const { raw, mapped, bpm, camelot } of analyzed) {
    if (!camelot) continue;

    resolved.push({
      spotify_id: raw.id,
      name: mapped.name,
      artist: mapped.artist,
      image: mapped.image,
      bpm,
      camelot,
    });
  }

  return resolved;
}

function findSingleBridges(
  resolved: ResolvedCandidate[],
  track1Key: CamelotKey,
  track2Key: CamelotKey
): ScoredBridge[] {
  const passing: ScoredBridge[] = [];

  for (const candidate of resolved) {
    const { pass, compat1, compat2 } = isCompatibleWithBoth(
      candidate.camelot,
      track1Key,
      track2Key
    );
    if (!pass) continue;

    passing.push({
      ...toBridgeTrackResult(candidate, track1Key, track2Key),
      sortScore: compat1.score + compat2.score,
    });
  }

  return passing;
}

function findBestBridgePath(
  resolved: ResolvedCandidate[],
  track1Key: CamelotKey,
  track2Key: CamelotKey
): BridgeTrackResult[] | null {
  const bridgeACandidates = resolved.filter(
    (candidate) =>
      isNonIncompatibleWithTrack(candidate.camelot, track1Key).type !== "incompatible"
  );
  const bridgeBCandidates = resolved.filter(
    (candidate) =>
      isNonIncompatibleWithTrack(candidate.camelot, track2Key).type !== "incompatible"
  );

  let bestPair: { bridgeA: ResolvedCandidate; bridgeB: ResolvedCandidate; score: number } | null =
    null;

  for (const bridgeA of bridgeACandidates) {
    for (const bridgeB of bridgeBCandidates) {
      if (bridgeA.spotify_id === bridgeB.spotify_id) continue;

      const compatAB = isNonIncompatibleWithTrack(bridgeA.camelot, bridgeB.camelot);
      if (compatAB.type === "incompatible") continue;

      const compatA1 = isNonIncompatibleWithTrack(bridgeA.camelot, track1Key);
      const compatB2 = isNonIncompatibleWithTrack(bridgeB.camelot, track2Key);
      const score = compatA1.score + compatAB.score + compatB2.score;

      if (!bestPair || score > bestPair.score) {
        bestPair = { bridgeA, bridgeB, score };
      }
    }
  }

  if (!bestPair) return null;

  return [
    toBridgeTrackResult(bestPair.bridgeA, track1Key, track2Key),
    toBridgeTrackResult(bestPair.bridgeB, track1Key, track2Key),
  ];
}

function mergeResolvedCandidates(
  existing: ResolvedCandidate[],
  incoming: ResolvedCandidate[]
): ResolvedCandidate[] {
  const byId = new Map(existing.map((candidate) => [candidate.spotify_id, candidate]));
  for (const candidate of incoming) {
    byId.set(candidate.spotify_id, candidate);
  }
  return [...byId.values()];
}

async function fetchSpotifyRecommendations(
  seedIds: string[],
  headers: Record<string, string>
): Promise<SpotifyApiTrack[]> {
  if (seedIds.length === 0) return [];

  const seedTracks = seedIds.slice(0, 5).join(",");
  const params = new URLSearchParams({
    limit: "50",
    seed_tracks: seedTracks,
  });

  const url = `https://api.spotify.com/v1/recommendations?${params}`;
  console.log("[bridge] Spotify recommendations request:", { url, seed_tracks: seedTracks });

  const res = await fetch(url, {
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn("[bridge] Spotify recommendations failed:", res.status, body);
    return [];
  }

  const data = (await res.json()) as { tracks?: SpotifyApiTrack[] };
  return data.tracks ?? [];
}

async function searchSpotifyTrack(
  name: string,
  artist: string,
  headers: Record<string, string>
): Promise<SpotifyApiTrack | null> {
  const market = process.env.SPOTIFY_MARKET ?? "US";
  const q = `track:${name} artist:${artist}`;
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1&market=${encodeURIComponent(market)}`;

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json()) as { tracks?: { items?: SpotifyApiTrack[] } };
  return data.tracks?.items?.[0] ?? null;
}

function topBridges(candidates: ScoredBridge[]): BridgeTrackResult[] {
  return candidates
    .sort((a, b) => b.sortScore - a.sortScore)
    .slice(0, 3)
    .map(({ sortScore: _sortScore, ...bridge }) => bridge);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      track1?: unknown;
      track2?: unknown;
    };

    const track1 = parseInputTrack(body.track1, "track1");
    const track2 = parseInputTrack(body.track2, "track2");

    if (!track1 || !track2) {
      return NextResponse.json({ error: "Invalid track1 or track2 payload" }, { status: 400 });
    }

    const track1Key = parseMusicalKeyString(track1.camelot);
    const track2Key = parseMusicalKeyString(track2.camelot);

    if (!track1Key || !track2Key) {
      return NextResponse.json({ error: "Invalid Camelot keys" }, { status: 400 });
    }

    const excludeIds = new Set([track1.spotify_id, track2.spotify_id]);
    const token = await getSpotifyToken();
    const headers = { Authorization: `Bearer ${token}` };

    const spotifyCandidates = await fetchSpotifyRecommendations(
      [track1.spotify_id, track2.spotify_id],
      headers
    );

    const popularSpotifyCandidates = spotifyCandidates.filter(
      (track) => (track.popularity ?? 0) >= MIN_BRIDGE_POPULARITY
    );

    let resolvedCandidates = await resolveSpotifyCandidates(
      popularSpotifyCandidates,
      excludeIds
    );

    let passing = findSingleBridges(resolvedCandidates, track1Key, track2Key);

    if (passing.length === 0) {
      const track1Meta = (await resolveTrackMetadataByIds([track1.spotify_id])).get(
        track1.spotify_id
      );

      if (track1Meta) {
        const similar = await fetchLastFmSimilarTracks(track1Meta.name, track1Meta.artist, 20);
        const lastFmCandidates: SpotifyApiTrack[] = [];
        const seenIds = new Set(excludeIds);

        await Promise.all(
          similar.map(async (item) => {
            const match = await searchSpotifyTrack(item.name, item.artist, headers);
            if (!match?.id || seenIds.has(match.id)) return;
            seenIds.add(match.id);
            lastFmCandidates.push(match);
          })
        );

        const lastFmResolved = await resolveSpotifyCandidates(lastFmCandidates, excludeIds);
        resolvedCandidates = mergeResolvedCandidates(resolvedCandidates, lastFmResolved);
        passing = findSingleBridges(resolvedCandidates, track1Key, track2Key);
      }
    }

    if (passing.length > 0) {
      return NextResponse.json({ type: "single", bridges: topBridges(passing) });
    }

    const pathBridges = findBestBridgePath(resolvedCandidates, track1Key, track2Key);
    if (pathBridges) {
      return NextResponse.json({ type: "path", bridges: pathBridges });
    }

    return NextResponse.json({ type: "single", bridges: [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[bridge] Unhandled error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
