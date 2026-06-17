import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotify-auth";
import { fetchTracksAudioAnalysis } from "@/lib/audio-analysis";
import type { AudioAnalysis } from "@/lib/audio-analysis";
import type { CamelotKey } from "@/lib/camelot";

const FEATURES_OVERALL_TIMEOUT_MS = 12000;
const ANALYSIS_PENDING_MESSAGE =
  "Still analyzing — try searching again in a moment";

export interface TrackFeatures {
  popularity: number;
  duration_ms: number;
  explicit: boolean;
  genres: string[];
  release_date: string | null;
  bpm: number | null;
  musical_key: string | null;
  camelot: CamelotKey | null;
  source: "reccobeats" | "getsongbpm" | "soundnet" | "musicbrainz" | null;
}

interface ClientTrackInput {
  id: string;
  name?: string;
  artist?: string;
  image?: string | null;
  preview_url?: string | null;
  artist_id?: string | null;
  popularity?: number;
  duration_ms?: number;
  explicit?: boolean;
  release_date?: string | null;
}

interface SpotifyTrackObject {
  id: string;
  popularity: number;
  duration_ms: number;
  explicit: boolean;
  album: { release_date: string };
  artists: Array<{ id: string }>;
}

async function fetchArtistGenres(
  artistIds: string[],
  headers: Record<string, string>
): Promise<Record<string, string[]>> {
  const artistGenres: Record<string, string[]> = {};
  if (artistIds.length === 0) return artistGenres;

  const artistsRes = await fetch(
    `https://api.spotify.com/v1/artists?ids=${artistIds.map(encodeURIComponent).join(",")}`,
    { headers, cache: "no-store" }
  );

  if (!artistsRes.ok) {
    const body = await artistsRes.text().catch(() => "");
    console.error("[spotify/features] Artists fetch failed:", {
      status: artistsRes.status,
      body,
    });
    return artistGenres;
  }

  const artistsData = (await artistsRes.json()) as {
    artists: Array<{ id: string; genres: string[] } | null>;
  };
  for (const a of artistsData.artists ?? []) {
    if (a?.id) artistGenres[a.id] = a.genres ?? [];
  }
  return artistGenres;
}

async function resolveSpotifyFeatures(
  tracks: ClientTrackInput[],
  headers: Record<string, string>
): Promise<Omit<TrackFeatures, "bpm" | "musical_key" | "camelot" | "source">[]> {
  const idList = tracks.map((t) => t.id).filter(Boolean);

  let spotifyTracks: Array<SpotifyTrackObject | null> = [];
  const tracksUrl = `https://api.spotify.com/v1/tracks?ids=${idList.map(encodeURIComponent).join(",")}`;
  const tracksRes = await fetch(tracksUrl, { headers, cache: "no-store" });

  if (tracksRes.ok) {
    const tracksData = (await tracksRes.json()) as { tracks: Array<SpotifyTrackObject | null> };
    spotifyTracks = tracksData.tracks ?? [];
    console.log("[spotify/features] Tracks endpoint succeeded for", idList.length, "ids");
  } else {
    const body = await tracksRes.text().catch(() => "");
    console.warn("[spotify/features] Tracks endpoint failed, using search metadata:", {
      status: tracksRes.status,
      body,
    });
    spotifyTracks = tracks.map((t) =>
      t.id
        ? {
            id: t.id,
            popularity: t.popularity ?? 0,
            duration_ms: t.duration_ms ?? 0,
            explicit: t.explicit ?? false,
            album: { release_date: t.release_date ?? "" },
            artists: t.artist_id ? [{ id: t.artist_id }] : [],
          }
        : null
    );
  }

  const artistIdSet = new Set<string>();
  for (const t of spotifyTracks) {
    const fromApi = t?.artists?.[0]?.id;
    if (fromApi) artistIdSet.add(fromApi);
  }
  for (const t of tracks) {
    if (t.artist_id) artistIdSet.add(t.artist_id);
  }

  const artistGenres = await fetchArtistGenres(Array.from(artistIdSet), headers);

  return spotifyTracks.map((t, i) => {
    if (!t) {
      return {
        popularity: 0,
        duration_ms: 0,
        explicit: false,
        genres: [],
        release_date: null,
      };
    }
    const primaryArtistId = t.artists?.[0]?.id ?? tracks[i]?.artist_id ?? "";
    return {
      popularity: t.popularity,
      duration_ms: t.duration_ms,
      explicit: t.explicit,
      genres: artistGenres[primaryArtistId] ?? [],
      release_date: t.album?.release_date || tracks[i]?.release_date || null,
    };
  });
}

function emptyAudioAnalysis(): AudioAnalysis {
  return {
    bpm: null,
    musicalKey: null,
    camelot: null,
    source: null,
    popularity: null,
    genres: [],
  };
}

function fallbackSpotifyFeatures(
  tracks: ClientTrackInput[]
): Omit<TrackFeatures, "bpm" | "musical_key" | "camelot" | "source">[] {
  return tracks.map((t) => ({
    popularity: t.popularity ?? 0,
    duration_ms: t.duration_ms ?? 0,
    explicit: t.explicit ?? false,
    genres: [],
    release_date: t.release_date ?? null,
  }));
}

function mergeTrackFeatures(
  tracks: ClientTrackInput[],
  spotifyFeatures: Omit<TrackFeatures, "bpm" | "musical_key" | "camelot" | "source">[],
  audioResults: AudioAnalysis[]
): TrackFeatures[] {
  return spotifyFeatures.map((spotify, i) => {
    const audio = audioResults[i] ?? emptyAudioAnalysis();
    const clientPopularity = tracks[i]?.popularity;
    const popularity =
      audio.popularity ??
      (spotify.popularity > 0 ? spotify.popularity : clientPopularity ?? spotify.popularity);

    return {
      ...spotify,
      popularity,
      genres: audio.genres.length > 0 ? audio.genres : spotify.genres,
      bpm: audio.bpm,
      musical_key: audio.musicalKey,
      camelot: audio.camelot,
      source: audio.source,
    };
  });
}

async function resolveTrackFeatures(
  tracks: ClientTrackInput[],
  headers: Record<string, string>
): Promise<{
  features: TrackFeatures[];
  partial: boolean;
  message?: string;
}> {
  const spotifyPromise = resolveSpotifyFeatures(tracks, headers);
  const audioPromise = fetchTracksAudioAnalysis(
    tracks.map((t) => ({
      artist: t.artist ?? "",
      title: t.name ?? "",
      duration_ms: t.duration_ms,
      spotify_id: t.id,
      artwork_url: t.image ?? null,
    }))
  );

  let spotifyFeatures: Awaited<ReturnType<typeof resolveSpotifyFeatures>> | undefined;
  let audioResults: Awaited<ReturnType<typeof fetchTracksAudioAnalysis>> | undefined;

  void spotifyPromise.then((result) => {
    spotifyFeatures = result;
  });
  void audioPromise.then((result) => {
    audioResults = result;
  });

  await Promise.race([
    Promise.allSettled([spotifyPromise, audioPromise]),
    new Promise<void>((resolve) => setTimeout(resolve, FEATURES_OVERALL_TIMEOUT_MS)),
  ]);

  const spotifyTimedOut = spotifyFeatures === undefined;
  const audioTimedOut = audioResults === undefined;

  if (spotifyTimedOut || audioTimedOut) {
    console.warn("[spotify/features] Overall timeout — returning partial results:", {
      timeoutMs: FEATURES_OVERALL_TIMEOUT_MS,
      spotifyTimedOut,
      audioTimedOut,
    });
  }

  const spotify = spotifyFeatures ?? fallbackSpotifyFeatures(tracks);
  const audio = audioResults ?? tracks.map(() => emptyAudioAnalysis());
  const features = mergeTrackFeatures(tracks, spotify, audio);

  if (audioTimedOut) {
    return {
      features,
      partial: true,
      message: ANALYSIS_PENDING_MESSAGE,
    };
  }

  return { features, partial: false };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { tracks?: ClientTrackInput[] };
    const tracks = body.tracks ?? [];
    if (tracks.length === 0) {
      return NextResponse.json({ error: "No tracks provided" }, { status: 400 });
    }

    const token = await getSpotifyToken();
    const { features, partial, message } = await resolveTrackFeatures(tracks, {
      Authorization: `Bearer ${token}`,
    });
    return NextResponse.json({
      features,
      ...(partial ? { partial: true, message } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get("ids");
  if (!ids) {
    return NextResponse.json({ error: "Missing ids parameter" }, { status: 400 });
  }

  const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
  if (idList.length === 0) {
    return NextResponse.json({ error: "No valid track IDs" }, { status: 400 });
  }

  try {
    const token = await getSpotifyToken();
    const { features, partial, message } = await resolveTrackFeatures(
      idList.map((id) => ({ id })),
      { Authorization: `Bearer ${token}` }
    );
    return NextResponse.json({
      features,
      ...(partial ? { partial: true, message } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
