/**
 * Expected Supabase table:
 *
 * create table if not exists comparison_history (
 *   id uuid primary key default gen_random_uuid(),
 *   track1_spotify_id text not null,
 *   track2_spotify_id text not null,
 *   score int,
 *   compared_at timestamptz default now(),
 *   client_id text
 * );
 *
 * alter table comparison_history add column if not exists client_id text;
 */

import { NextRequest, NextResponse } from "next/server";
import { parseMusicalKeyString } from "@/lib/camelot";
import {
  COMPARISON_DEDUPE_WINDOW_MS,
  comparisonPairKey,
  dedupeComparisonHistory,
} from "@/lib/comparison-history";
import { createSupabaseServerClient } from "@/lib/supabase";
import { resolveTrackMetadataByIds } from "@/lib/track-metadata";
import { getCachedTrackRowsByIds } from "@/lib/tracks-cache";
import {
  isMissingClientIdColumnError,
  readVisitorClientId,
} from "@/lib/visitor-id";

const HISTORY_LIMIT = 50;

interface ComparisonHistoryRow {
  id: string;
  track1_spotify_id: string;
  track2_spotify_id: string;
  score: number | null;
  compared_at: string;
}

function isMissingTableError(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("comparison_history") && lower.includes("does not exist");
}

function isHistorySchemaError(message: string | undefined): boolean {
  return isMissingTableError(message) || isMissingClientIdColumnError(message);
}

function parseSpotifyId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(Math.min(100, Math.max(0, value)));
}

export async function GET(request: NextRequest) {
  const clientId = readVisitorClientId(request);
  if (!clientId) {
    return NextResponse.json({ items: [] });
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ items: [] });
  }

  try {
    const { data, error } = await supabase
      .from("comparison_history")
      .select("id, track1_spotify_id, track2_spotify_id, score, compared_at")
      .eq("client_id", clientId)
      .order("compared_at", { ascending: false })
      .limit(HISTORY_LIMIT * 3);

    if (error) {
      if (isHistorySchemaError(error.message)) {
        console.warn("[history] comparison_history is missing table or client_id column — run the migration");
        return NextResponse.json({ items: [] });
      }
      console.warn("[history] Read failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = dedupeComparisonHistory((data ?? []) as ComparisonHistoryRow[]).slice(
      0,
      HISTORY_LIMIT
    );
    const ids = [
      ...new Set(
        rows.flatMap((row) => [row.track1_spotify_id, row.track2_spotify_id]).filter(Boolean)
      ),
    ];

    const [metadataById, cacheById] = await Promise.all([
      resolveTrackMetadataByIds(ids),
      getCachedTrackRowsByIds(ids),
    ]);

    const items = rows.map((row) => {
      const meta1 = metadataById.get(row.track1_spotify_id);
      const meta2 = metadataById.get(row.track2_spotify_id);
      const cache1 = cacheById.get(row.track1_spotify_id);
      const cache2 = cacheById.get(row.track2_spotify_id);

      return {
        id: row.id,
        score: row.score,
        compared_at: row.compared_at,
        track1: {
          spotify_id: row.track1_spotify_id,
          name: meta1?.name || cache1?.title?.trim() || "Unknown Track",
          artist: meta1?.artist || cache1?.artist?.trim() || "Unknown Artist",
          image: meta1?.image || cache1?.artwork_url?.trim() || null,
          camelot:
            cache1?.camelot_label?.trim() ||
            parseMusicalKeyString(cache1?.musical_key ?? "")?.label ||
            null,
        },
        track2: {
          spotify_id: row.track2_spotify_id,
          name: meta2?.name || cache2?.title?.trim() || "Unknown Track",
          artist: meta2?.artist || cache2?.artist?.trim() || "Unknown Artist",
          image: meta2?.image || cache2?.artwork_url?.trim() || null,
          camelot:
            cache2?.camelot_label?.trim() ||
            parseMusicalKeyString(cache2?.musical_key ?? "")?.label ||
            null,
        },
      };
    });

    return NextResponse.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[history] GET error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      track1_spotify_id?: unknown;
      track2_spotify_id?: unknown;
      score?: unknown;
      client_id?: unknown;
    };

    const track1 = parseSpotifyId(body.track1_spotify_id);
    const track2 = parseSpotifyId(body.track2_spotify_id);
    const score = parseScore(body.score);
    const clientId = readVisitorClientId(request, body.client_id);

    if (!clientId) {
      return NextResponse.json({ error: "Missing client_id" }, { status: 400 });
    }

    if (!track1 || !track2 || score == null) {
      return NextResponse.json({ error: "Invalid history payload" }, { status: 400 });
    }

    const pairKey = comparisonPairKey(track1, track2);
    const { data: recentRows, error: recentError } = await supabase
      .from("comparison_history")
      .select("id, track1_spotify_id, track2_spotify_id, compared_at")
      .eq("client_id", clientId)
      .order("compared_at", { ascending: false })
      .limit(40);

    if (recentError && !isHistorySchemaError(recentError.message)) {
      console.warn("[history] Recent-row lookup failed:", recentError.message);
    }

    const recentMatch = ((recentRows ?? []) as Array<{
      id: string;
      track1_spotify_id: string;
      track2_spotify_id: string;
      compared_at: string;
    }>).find((row) => comparisonPairKey(row.track1_spotify_id, row.track2_spotify_id) === pairKey);

    if (recentMatch) {
      const comparedAt = Date.parse(recentMatch.compared_at);
      if (
        Number.isFinite(comparedAt) &&
        Date.now() - comparedAt < COMPARISON_DEDUPE_WINDOW_MS
      ) {
        const { error: updateError } = await supabase
          .from("comparison_history")
          .update({
            score,
            compared_at: new Date().toISOString(),
          })
          .eq("id", recentMatch.id)
          .eq("client_id", clientId);

        if (updateError) {
          console.warn("[history] Dedupe update failed:", updateError.message);
        } else {
          return NextResponse.json({ ok: true, deduped: true });
        }
      }
    }

    const { error } = await supabase.from("comparison_history").insert({
      track1_spotify_id: track1,
      track2_spotify_id: track2,
      score,
      client_id: clientId,
    });

    if (error) {
      if (isHistorySchemaError(error.message)) {
        console.warn("[history] comparison_history is missing table or client_id column — run the migration");
        return NextResponse.json({ error: "History table is not set up yet" }, { status: 503 });
      }
      console.warn("[history] Insert failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[history] POST error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
