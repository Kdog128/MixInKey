import { NextRequest, NextResponse } from "next/server";
import { getRecentCachedArtworkUrls } from "@/lib/tracks-cache";

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const parsed = limitParam ? Number.parseInt(limitParam, 10) : 72;
    const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 72) : 72;
    const artwork_urls = await getRecentCachedArtworkUrls(limit);

    console.log("[artwork-wall] API response:", {
      requestedLimit: limit,
      uniqueArtworkUrlsReturned: artwork_urls.length,
    });

    return NextResponse.json({
      artwork_urls,
      count: artwork_urls.length,
      unique_count: artwork_urls.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[artwork-wall] API error:", msg);
    return NextResponse.json({ error: msg, artwork_urls: [], count: 0, unique_count: 0 }, { status: 500 });
  }
}
