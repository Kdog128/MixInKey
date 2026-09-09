"use client";

export interface EssentiaTrackInput {
  id: string;
  name: string;
  artist: string;
  image?: string | null;
  isrc?: string | null;
  duration_ms?: number;
}

type WorkerResponse =
  | {
      requestId?: number;
      ok: true;
      bpm: number;
      key: string;
      scale: string;
      strength: number;
      fingerprint?: string;
    }
  | { requestId?: number; ok: false; error: string };

let workerPromise: Promise<Worker> | null = null;
let nextRequestId = 0;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = Promise.resolve(new Worker("/essentia/worker.js?v=2"));
  }
  return workerPromise;
}

async function decodeMono(arrayBuffer: ArrayBuffer): Promise<{ samples: Float32Array; sampleRate: number }> {
  const ctx = new AudioContext();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    return { samples: new Float32Array(channel), sampleRate: audioBuffer.sampleRate };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function analyzeInWorker(samples: Float32Array, sampleRate: number): Promise<WorkerResponse> {
  const requestId = ++nextRequestId;
  return getWorker().then(
    (worker) =>
      new Promise<WorkerResponse>((resolve, reject) => {
        const handleMessage = (event: MessageEvent<WorkerResponse>) => {
          if (event.data?.requestId !== requestId) return;
          worker.removeEventListener("message", handleMessage);
          worker.removeEventListener("error", handleError);
          resolve(event.data);
        };
        const handleError = (event: ErrorEvent) => {
          worker.removeEventListener("message", handleMessage);
          worker.removeEventListener("error", handleError);
          reject(event.error ?? new Error(event.message || "Essentia worker failed"));
        };
        worker.addEventListener("message", handleMessage);
        worker.addEventListener("error", handleError);
        worker.postMessage({ type: "analyze", requestId, samples, sampleRate }, [samples.buffer]);
      })
  );
}

async function markEssentiaFailed(track: EssentiaTrackInput): Promise<void> {
  await fetch("/api/tracks/essentia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spotify_id: track.id,
      artist: track.artist,
      title: track.name,
      artwork_url: track.image ?? null,
      failed: true,
    }),
  });
}

/** Returns true when BPM/key were detected and cached. */
export async function analyzeTrackWithEssentia(track: EssentiaTrackInput): Promise<boolean> {
  if (!track.id) return false;

  try {
    const previewRes = await fetch("/api/deezer/preview", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: track.name,
        artist: track.artist,
        isrc: track.isrc ?? null,
        spotify_id: track.id,
        duration_ms: track.duration_ms,
      }),
    });

    if (!previewRes.ok) {
      console.warn("[essentia] Preview request failed:", {
        spotifyId: track.id,
        status: previewRes.status,
      });
      await markEssentiaFailed(track);
      return false;
    }

    const previewUrl = previewRes.headers.get("x-deezer-preview-url");
    const deezerTitle = decodeURIComponent(previewRes.headers.get("x-deezer-title") ?? "");
    const deezerArtist = decodeURIComponent(previewRes.headers.get("x-deezer-artist") ?? "");
    const audio = await previewRes.arrayBuffer();
    console.log("[essentia] Preview fetched:", {
      spotifyId: track.id,
      title: track.name,
      artist: track.artist,
      previewUrl,
      deezerTitle,
      deezerArtist,
      byteLength: audio.byteLength,
    });

    if (audio.byteLength === 0) {
      await markEssentiaFailed(track);
      return false;
    }

    const decoded = await decodeMono(audio);
    console.log("[essentia] Decoded audio:", {
      spotifyId: track.id,
      sampleRate: decoded.sampleRate,
      samples: decoded.samples.length,
    });
    const result = await analyzeInWorker(decoded.samples, decoded.sampleRate);
    console.log("[essentia] Raw output:", {
      spotifyId: track.id,
      result,
    });
    if (!result.ok) {
      await markEssentiaFailed(track);
      return false;
    }

    const musicalKey = `${result.key} ${result.scale}`;
    const saveRes = await fetch("/api/tracks/essentia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spotify_id: track.id,
        artist: track.artist,
        title: track.name,
        artwork_url: track.image ?? null,
        bpm: result.bpm,
        musical_key: musicalKey,
      }),
    });

    if (!saveRes.ok) {
      await markEssentiaFailed(track);
      return false;
    }

    const saved = (await saveRes.json()) as { cached?: string };
    return saved.cached === "essentia";
  } catch (err) {
    console.warn("[essentia] Fallback failed:", err);
    try {
      await markEssentiaFailed(track);
    } catch {
      // ignore
    }
    return false;
  }
}
