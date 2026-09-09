// -- CREATE TABLE bridge_cache (cache_key text PRIMARY KEY, result jsonb NOT NULL, created_at timestamptz DEFAULT now());

import { NextRequest, NextResponse } from "next/server";
import {
  getKeyCompatibility,
  parseMusicalKeyString,
  type CamelotKey,
  type KeyCompatibility,
} from "@/lib/camelot";
import {
  findBridgePath,
  type BridgeGraphNode,
} from "@/lib/bridge-path";
import { createSupabaseServerClient } from "@/lib/supabase";
import {
  getCachedTracksWithBpmAndKey,
  type TracksCacheRow,
} from "@/lib/tracks-cache";

interface BridgeInputTrack {
  spotify_id: string;
  camelot: string;
  bpm: number;
  name?: string;
  artist?: string;
  image?: string | null;
}

export interface BridgePathStep {
  spotify_id: string;
  name: string;
  artist: string;
  image: string | null;
  bpm: number;
  camelot: string;
  role: "start" | "bridge" | "end";
  fromPrevious: KeyCompatibility | null;
}

export interface BridgeResponse {
  type: "path" | "partial";
  complete: boolean;
  bpmTolerancePercent: 6 | 8 | 10;
  intermediateCount: number;
  path: BridgePathStep[];
  message: string;
}

interface BridgeCacheRow {
  cache_key: string;
  result: BridgeResponse;
  created_at: string;
}

const BRIDGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function buildBridgeCacheKey(track1Id: string, track2Id: string): string {
  return `bridge:path:v1:${[track1Id, track2Id].sort().join(":")}`;
}

function isBridgeCacheFresh(createdAt: string): boolean {
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs < BRIDGE_CACHE_TTL_MS;
}

function isPathResponse(value: unknown): value is BridgeResponse {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<BridgeResponse>;
  return Array.isArray(result.path) && result.path.length > 0 && typeof result.message === "string";
}

async function getFreshBridgeCache(cacheKey: string): Promise<BridgeResponse | null> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("bridge_cache")
      .select("cache_key, result, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (error) {
      console.warn("[bridge] Cache read failed:", { cacheKey, message: error.message });
      return null;
    }

    if (!data) return null;

    const row = data as BridgeCacheRow;
    if (!isBridgeCacheFresh(row.created_at)) {
      console.log("[bridge] Cache stale:", cacheKey);
      return null;
    }

    if (!isPathResponse(row.result)) {
      console.log("[bridge] Cache ignored (legacy shape):", cacheKey);
      return null;
    }

    console.log("[bridge] Cache hit:", cacheKey);
    return row.result;
  } catch (err) {
    console.warn("[bridge] Cache read error:", err);
    return null;
  }
}

async function saveBridgeCache(cacheKey: string, result: BridgeResponse): Promise<void> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return;

  try {
    const { error } = await supabase.from("bridge_cache").upsert(
      {
        cache_key: cacheKey,
        result,
        created_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" }
    );

    if (error) {
      console.warn("[bridge] Cache save failed:", { cacheKey, message: error.message });
      return;
    }

    console.log("[bridge] Cache saved:", cacheKey);
  } catch (err) {
    console.warn("[bridge] Cache save error:", err);
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

  return {
    spotify_id: spotifyId,
    camelot,
    bpm,
    name: typeof track.name === "string" ? track.name.trim() : undefined,
    artist: typeof track.artist === "string" ? track.artist.trim() : undefined,
    image: typeof track.image === "string" ? track.image.trim() : null,
  };
}

function rowCamelot(row: TracksCacheRow): CamelotKey | null {
  return (
    (row.camelot_label ? parseMusicalKeyString(row.camelot_label) : null) ??
    (row.musical_key ? parseMusicalKeyString(row.musical_key) : null)
  );
}

function nodeFromRow(row: TracksCacheRow, camelot: CamelotKey): BridgeGraphNode | null {
  if (!row.spotify_id || row.bpm == null) return null;
  return {
    id: row.spotify_id,
    name: row.title?.trim() || "Unknown Track",
    artist: row.artist?.trim() || "Unknown Artist",
    image: row.artwork_url?.trim() || null,
    bpm: row.bpm,
    camelot,
  };
}

function nodeFromInput(
  track: BridgeInputTrack,
  camelot: CamelotKey,
  fallbackName: string
): BridgeGraphNode {
  return {
    id: track.spotify_id,
    name: track.name?.trim() || fallbackName,
    artist: track.artist?.trim() || "",
    image: track.image ?? null,
    bpm: track.bpm,
    camelot,
  };
}

function buildGraphNodes(
  rows: TracksCacheRow[],
  track1: BridgeInputTrack,
  track2: BridgeInputTrack,
  track1Key: CamelotKey,
  track2Key: CamelotKey
): BridgeGraphNode[] {
  const byId = new Map<string, BridgeGraphNode>();

  for (const row of rows) {
    const camelot = rowCamelot(row);
    const node = camelot ? nodeFromRow(row, camelot) : null;
    if (node) byId.set(node.id, node);
  }

  const start = nodeFromInput(track1, track1Key, "Track 1");
  const end = nodeFromInput(track2, track2Key, "Track 2");
  const existingStart = byId.get(start.id);
  const existingEnd = byId.get(end.id);

  byId.set(start.id, {
    ...start,
    name: start.name !== "Track 1" ? start.name : existingStart?.name || start.name,
    artist: start.artist || existingStart?.artist || "",
    image: start.image || existingStart?.image || null,
  });
  byId.set(end.id, {
    ...end,
    name: end.name !== "Track 2" ? end.name : (existingEnd?.name || end.name),
    artist: end.artist || existingEnd?.artist || "",
    image: end.image || existingEnd?.image || null,
  });

  return [...byId.values()];
}

function toPathSteps(
  nodes: BridgeGraphNode[],
  complete: boolean
): BridgePathStep[] {
  return nodes.map((node, index) => {
    const isFirst = index === 0;
    const isLast = index === nodes.length - 1;
    let role: BridgePathStep["role"] = "bridge";
    if (isFirst) role = "start";
    else if (isLast && complete) role = "end";

    const previous = index > 0 ? nodes[index - 1] : null;
    return {
      spotify_id: node.id,
      name: node.name,
      artist: node.artist,
      image: node.image,
      bpm: node.bpm,
      camelot: node.camelot.label,
      role,
      fromPrevious: previous
        ? getKeyCompatibility(previous.camelot, node.camelot)
        : null,
    };
  });
}

function tolerancePercent(tolerance: number): 6 | 8 | 10 {
  const percent = Math.round(tolerance * 100);
  if (percent <= 6) return 6;
  if (percent <= 8) return 8;
  return 10;
}

function buildMessage(
  complete: boolean,
  intermediateCount: number,
  bpmTolerancePercent: 6 | 8 | 10
): string {
  if (complete && intermediateCount === 0) {
    return `These tracks mix directly at ${bpmTolerancePercent}% BPM.`;
  }
  if (complete) {
    const hopLabel = intermediateCount === 1 ? "1 bridge track" : `${intermediateCount} bridge tracks`;
    if (bpmTolerancePercent > 6) {
      return `Shortest mix uses ${hopLabel} at ${bpmTolerancePercent}% BPM (looser match).`;
    }
    return `Shortest mix uses ${hopLabel} at ${bpmTolerancePercent}% BPM.`;
  }
  if (intermediateCount === 0) {
    return "No mixable next track toward Track 2 in the cache (within 4 hops at 10% BPM).";
  }
  return `No full path within 4 hops. This sequence gets ${intermediateCount} hop${intermediateCount === 1 ? "" : "s"} toward Track 2 (10% BPM).`;
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

    const cacheKey = buildBridgeCacheKey(track1.spotify_id, track2.spotify_id);
    const bustCache = request.nextUrl.searchParams.get("bust") === "1";

    if (!bustCache) {
      const cachedResult = await getFreshBridgeCache(cacheKey);
      if (cachedResult) {
        return NextResponse.json(cachedResult);
      }
    }

    const track1Key = parseMusicalKeyString(track1.camelot);
    const track2Key = parseMusicalKeyString(track2.camelot);

    if (!track1Key || !track2Key) {
      return NextResponse.json({ error: "Invalid Camelot keys" }, { status: 400 });
    }

    const catalog = await getCachedTracksWithBpmAndKey();
    const graphNodes = buildGraphNodes(catalog, track1, track2, track1Key, track2Key);
    const search = findBridgePath(graphNodes, track1.spotify_id, track2.spotify_id);

    if (!search) {
      return NextResponse.json({ error: "Unable to build bridge graph" }, { status: 500 });
    }

    const bpmTolerancePercent = tolerancePercent(search.bpmTolerance);
    const intermediateCount = search.complete
      ? Math.max(0, search.nodes.length - 2)
      : Math.max(0, search.nodes.length - 1);
    const path = toPathSteps(search.nodes, search.complete);
    const message = buildMessage(search.complete, intermediateCount, bpmTolerancePercent);

    const response: BridgeResponse = {
      type: search.complete ? "path" : "partial",
      complete: search.complete,
      bpmTolerancePercent,
      intermediateCount,
      path,
      message,
    };

    console.log("[bridge] Path search:", {
      catalog: catalog.length,
      nodes: graphNodes.length,
      complete: search.complete,
      hops: intermediateCount,
      bpmTolerancePercent,
      path: path.map((step) => `${step.name} (${step.camelot}, ${step.bpm})`),
    });

    await saveBridgeCache(cacheKey, response);
    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[bridge] Unhandled error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
