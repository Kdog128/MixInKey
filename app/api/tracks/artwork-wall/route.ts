import { NextRequest, NextResponse } from "next/server";
import { getRecentCachedArtworkUrls } from "@/lib/tracks-cache";

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const parsed = limitParam ? Number.parseInt(limitParam, 10) : 25;
    const limit = Number.isFinite(parsed) ? parsed : 25;
    const artwork_urls = await getRecentCachedArtworkUrls(limit);

    return NextResponse.json({ artwork_urls });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg, artwork_urls: [] }, { status: 500 });
  }
}
