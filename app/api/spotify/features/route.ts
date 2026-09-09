import { after, NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotify-auth";
import { fetchTracksAudioAnalysis } from "@/lib/audio-analysis";
import type { AudioAnalysis, AudioAnalysisSource } from "@/lib/audio-analysis";
import type { CamelotKey } from "@/lib/camelot";
import { needsEssentiaFallback, getCachedTracksAnalysis } from "@/lib/tracks-cache";
import { createSupabaseServerClient } from "@/lib/supabase";

const FEATURES_OVERALL_TIMEOUT_MS = 6000;

export interface TrackFeatures {
  popularity: number;
  duration_ms: number;
  explicit: boolean;
  genres: string[];
  release_date: string | null;
  bpm: number | null;
  musical_key: string | null;
  camelot: CamelotKey | null;
  source: AudioAnalysisSource;
  needs_resolution?: boolean;
  needs_audio_analysis?: boolean;
}

interface ClientTrackInput {
  id: string;
  spotify_id?: string | null;
  name?: string;
  artist?: string;
  image?: string | null;
  preview_url?: string | null;
  artist_id?: string | null;
  popularity?: number;
  duration_ms?: number;
  explicit?: boolean;
  release_date?: string | null;
  isrc?: string | null;
}

interface SpotifyTrackObject {
  id: string;
  popularity: number;
  duration_ms: number;
  explicit: boolean;
  album: { release_date: string };
  artists: Array<{ id: string }>;
}

function needsSpotifyIdResolution(track: ClientTrackInput): boolean {
  if (track.spotify_id !== null) return false;
  return Boolean(track.name?.trim() && track.artist?.trim());
}

function normalizeTrackText(value: string): string {
  return value.trim().toLowerCase();
}

function isRealSpotifyId(spotifyId: string): boolean {
  return !/^[0-9]+$/.test(spotifyId.trim());
}

async function resolveSpotifyIdFromNameArtistCache(
  name: string,
  artist: string
): Promise<{ spotifyId: string; bpm: number; key: string | null } | null> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return null;

  const title = name.trim();
  const artistName = artist.trim();
  if (!title || !artistName) return null;

  try {
    console.log("[spotify/features] Name/artist cache lookup:", {
      title,
      artist: artistName,
    });

    const { data, error } = await supabase
      .from("tracks_cache")
      .select("spotify_id, artist, title, bpm, musical_key, camelot_label")
      .ilike("title", title)
      .ilike("artist", artistName)
      .not("spotify_id", "match", "^[0-9]+$")
      .not("bpm", "is", null)
      .limit(10);

    console.log("[spotify/features] Name/artist cache lookup response:", { data, error });

    if (error) {
      console.warn("[spotify/features] Name/artist cache lookup failed:", error.message);
      return null;
    }

    const titleNorm = normalizeTrackText(title);
    const artistNorm = normalizeTrackText(artistName);

    const match = (data ?? []).find(
      (row: {
        spotify_id?: string;
        artist?: string | null;
        title?: string | null;
        bpm?: number | null;
        musical_key?: string | null;
        camelot_label?: string | null;
      }) => {
        const spotifyId = row.spotify_id?.trim();
        if (!spotifyId || !isRealSpotifyId(spotifyId)) return false;
        if (row.bpm == null) return false;
        return (
          normalizeTrackText(row.title ?? "") === titleNorm &&
          normalizeTrackText(row.artist ?? "") === artistNorm
        );
      }
    );

    if (!match?.spotify_id?.trim() || match.bpm == null) return null;

    return {
      spotifyId: match.spotify_id.trim(),
      bpm: match.bpm,
      key: match.musical_key ?? match.camelot_label ?? null,
    };
  } catch (err) {
    console.warn("[spotify/features] Name/artist cache lookup error:", err);
    return null;
  }
}

async function searchSpotifyTrackId(
  artist: string,
  name: string,
  headers: Record<string, string>
): Promise<{ id: string | null; rateLimited: boolean }> {
  const market = process.env.SPOTIFY_MARKET ?? "US";
  const query = `${artist} ${name}`.trim();
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1&market=${encodeURIComponent(market)}`;

  const res = await fetch(url, { headers, cache: "no-store" });

  if (res.status === 429) {
    console.warn("[spotify/features] Skipping Spotify ID resolution due to 429");
    return { id: null, rateLimited: true };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn("[spotify/features] Spotify ID resolution search failed:", {
      status: res.status,
      body,
    });
    return { id: null, rateLimited: false };
  }

  const data = (await res.json()) as { tracks?: { items?: Array<{ id: string }> } };
  return { id: data.tracks?.items?.[0]?.id ?? null, rateLimited: false };
}

async function applyNameArtistCacheToTracks(
  tracks: ClientTrackInput[]
): Promise<ClientTrackInput[]> {
  return Promise.all(
    tracks.map(async (track) => {
      if (!needsSpotifyIdResolution(track)) {
        return track;
      }

      const artist = track.artist!.trim();
      const name = track.name!.trim();
      const cacheHit = await resolveSpotifyIdFromNameArtistCache(name, artist);

      if (!cacheHit) {
        return track;
      }

      console.log("[features] Resolved iTunes track via name/artist cache hit:", {
        spotifyId: cacheHit.spotifyId,
        bpm: cacheHit.bpm,
        key: cacheHit.key,
      });

      return {
        ...track,
        id: cacheHit.spotifyId,
        spotify_id: cacheHit.spotifyId,
      };
    })
  );
}

async function applySpotifySearchToTracks(
  tracks: ClientTrackInput[],
  headers: Record<string, string>
): Promise<Array<{ track: ClientTrackInput; needsResolution: boolean }>> {
  return Promise.all(
    tracks.map(async (track) => {
      if (!needsSpotifyIdResolution(track)) {
        const spotifyId =
          typeof track.spotify_id === "string" && track.spotify_id.trim()
            ? track.spotify_id.trim()
            : track.id?.trim() || "";
        return {
          track: spotifyId ? { ...track, id: spotifyId } : track,
          needsResolution: false,
        };
      }

      const artist = track.artist!.trim();
      const name = track.name!.trim();
      const { id: resolvedId, rateLimited } = await searchSpotifyTrackId(artist, name, headers);

      if (resolvedId) {
        console.log("[spotify/features] Resolved Spotify ID:", { artist, name, resolvedId });
        return {
          track: { ...track, id: resolvedId, spotify_id: resolvedId },
          needsResolution: false,
        };
      }

      return {
        track,
        needsResolution: rateLimited,
      };
    })
  );
}

async function fetchArtistGenres(
  artistIds: string[],
  headers: Record<string, string>
): Promise<Record<string, string[]>> {
  const artistGenres: Record<string, string[]> = {};
  if (artistIds.length === 0) return artistGenres;

  const artists = await Promise.all(
    artistIds.map(async (id) => {
      try {
        const artistsRes = await fetch(
          `https://api.spotify.com/v1/artists/${encodeURIComponent(id)}`,
          { headers, cache: "no-store" }
        );

        if (!artistsRes.ok) {
          const body = await artistsRes.text().catch(() => "");
          console.error("[spotify/features] Artist fetch failed:", {
            id,
            status: artistsRes.status,
            body,
          });
          return null;
        }

        return (await artistsRes.json()) as { id: string; genres: string[] };
      } catch (err) {
        console.error("[spotify/features] Artist fetch error:", { id, err });
        return null;
      }
    })
  );

  for (const a of artists) {
    if (a?.id) artistGenres[a.id] = a.genres ?? [];
  }
  return artistGenres;
}

async function resolveSpotifyFeatures(
  tracks: ClientTrackInput[],
  headers: Record<string, string>
): Promise<Omit<TrackFeatures, "bpm" | "musical_key" | "camelot" | "source">[]> {
  const idList = tracks.map((t) => t.id).filter(Boolean);

  const clientTrackById = new Map(tracks.filter((t) => t.id).map((t) => [t.id, t]));

  const spotifyTracks: Array<SpotifyTrackObject | null> = await Promise.all(
    idList.map(async (id) => {
      try {
        const tracksRes = await fetch(
          `https://api.spotify.com/v1/tracks/${encodeURIComponent(id)}`,
          { headers, cache: "no-store" }
        );

        if (tracksRes.ok) {
          return (await tracksRes.json()) as SpotifyTrackObject;
        }

        const body = await tracksRes.text().catch(() => "");
        console.warn("[spotify/features] Track fetch failed, using search metadata:", {
          id,
          status: tracksRes.status,
          body,
        });
      } catch (err) {
        console.warn("[spotify/features] Track fetch error, using search metadata:", {
          id,
          err,
        });
      }

      const t = clientTrackById.get(id);
      if (!t) return null;

      return {
        id: t.id,
        popularity: t.popularity ?? 0,
        duration_ms: t.duration_ms ?? 0,
        explicit: t.explicit ?? false,
        album: { release_date: t.release_date ?? "" },
        artists: t.artist_id ? [{ id: t.artist_id }] : [],
      };
    })
  );

  console.log("[spotify/features] Tracks resolved for", spotifyTracks.filter(Boolean).length, "of", idList.length, "ids");

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
  spotifyFeatures: Omit<TrackFeatures, "bpm" | "musical_key" | "camelot" | "source" | "needs_resolution">[],
  audioResults: AudioAnalysis[],
  needsResolutionFlags: boolean[]
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
      ...(needsResolutionFlags[i] ? { needs_resolution: true } : {}),
      ...(needsEssentiaFallback(audio) && tracks[i]?.id && !needsResolutionFlags[i]
        ? { needs_audio_analysis: true }
        : {}),
    };
  });
}

async function resolveTrackFeatures(
  tracks: ClientTrackInput[],
  headers: Record<string, string>
): Promise<{
  features: TrackFeatures[];
  timedOut: boolean;
}> {
  const cacheResolvedTracks = await applyNameArtistCacheToTracks(tracks);
  const resolutionOutcomes = await applySpotifySearchToTracks(cacheResolvedTracks, headers);
  const resolvedTracks = resolutionOutcomes.map((outcome) => outcome.track);
  const needsResolutionFlags = resolutionOutcomes.map((outcome) => outcome.needsResolution);
  const spotifyPromise = resolveSpotifyFeatures(resolvedTracks, headers);
  const audioPromise = fetchTracksAudioAnalysis(
    resolvedTracks.map((t) => ({
      artist: t.artist ?? "",
      title: t.name ?? "",
      duration_ms: t.duration_ms,
      spotify_id: t.id,
      artwork_url: t.image ?? null,
      isrc: t.isrc ?? null,
      release_date: t.release_date ?? null,
    }))
  );

  let spotifyFeatures: Awaited<ReturnType<typeof resolveSpotifyFeatures>> | undefined;
  let audioResults: Awaited<ReturnType<typeof fetchTracksAudioAnalysis>> | undefined;

  void spotifyPromise.then((result) => {
    spotifyFeatures = result;
  }).catch(() => undefined);
  void audioPromise.then((result) => {
    audioResults = result;
  }).catch(() => undefined);

  await Promise.race([
    Promise.allSettled([spotifyPromise, audioPromise]),
    new Promise<void>((resolve) => setTimeout(resolve, FEATURES_OVERALL_TIMEOUT_MS)),
  ]);

  const spotifyTimedOut = spotifyFeatures === undefined;
  const audioTimedOut = audioResults === undefined;

  if (spotifyTimedOut || audioTimedOut) {
    console.warn("[spotify/features] Overall timeout — returning available fields:", {
      timeoutMs: FEATURES_OVERALL_TIMEOUT_MS,
      spotifyTimedOut,
      audioTimedOut,
    });
    // Keep provider work alive to write cache, but do not hold the HTTP response.
    after(() => Promise.allSettled([spotifyPromise, audioPromise]));
  }

  const spotify = spotifyFeatures ?? fallbackSpotifyFeatures(resolvedTracks);
  let audio = audioResults;
  if (audioTimedOut) {
    const cacheMap = await getCachedTracksAnalysis(
      resolvedTracks.map((track) => track.id).filter((id): id is string => Boolean(id))
    );
    audio = resolvedTracks.map((track) => {
      const cached = track.id ? cacheMap.get(track.id) : undefined;
      return cached ?? emptyAudioAnalysis();
    });
  } else {
    audio = audioResults ?? resolvedTracks.map(() => emptyAudioAnalysis());
  }
  const features = mergeTrackFeatures(resolvedTracks, spotify, audio, needsResolutionFlags);

  return { features, timedOut: spotifyTimedOut || audioTimedOut };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { tracks?: ClientTrackInput[] };
    const tracks = body.tracks ?? [];
    if (tracks.length === 0) {
      return NextResponse.json({ error: "No tracks provided" }, { status: 400 });
    }

    const token = await getSpotifyToken();
    const { features, timedOut } = await resolveTrackFeatures(tracks, {
      Authorization: `Bearer ${token}`,
    });
    return NextResponse.json({
      features,
      ...(timedOut ? { timed_out: true } : {}),
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
    const { features, timedOut } = await resolveTrackFeatures(
      idList.map((id) => ({ id })),
      { Authorization: `Bearer ${token}` }
    );
    return NextResponse.json({
      features,
      ...(timedOut ? { timed_out: true } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
