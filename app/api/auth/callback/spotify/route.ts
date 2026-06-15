import { NextRequest, NextResponse } from "next/server";
import {
  exchangeAuthorizationCode,
  setUserTokens,
  verifyOAuthState,
} from "@/lib/spotify-session";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const redirectBase = new URL("/", request.url);

  if (error) {
    console.warn("[spotify/oauth] Authorization denied:", error);
    redirectBase.searchParams.set("spotify", "denied");
    return NextResponse.redirect(redirectBase);
  }

  if (!code || !(await verifyOAuthState(state))) {
    redirectBase.searchParams.set("spotify", "error");
    return NextResponse.redirect(redirectBase);
  }

  try {
    const tokens = await exchangeAuthorizationCode(code);
    await setUserTokens(tokens);
    redirectBase.searchParams.set("spotify", "connected");
    return NextResponse.redirect(redirectBase);
  } catch (err) {
    console.error("[spotify/oauth] Callback failed:", err);
    redirectBase.searchParams.set("spotify", "error");
    return NextResponse.redirect(redirectBase);
  }
}
