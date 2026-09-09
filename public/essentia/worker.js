/* Classic worker: essentia-wasm.web.js is compiled for ENVIRONMENT=web and
 * requires `window` or `importScripts`. Module workers have neither, so we
 * load the web glue + WASM from /public instead of importing through Turbopack. */
/* global EssentiaWASM, Essentia */

if (typeof document === "undefined") {
  self.document = { currentScript: null, title: "" };
}

importScripts("./essentia-wasm.web.js", "./essentia.js-core.umd.js");

const TARGET_RATE = 44100;
const MIN_BPM = 40;
const MAX_BPM = 208;
const MIN_KEY_STRENGTH = 0.12;

function downsample(samples, fromRate) {
  if (fromRate === TARGET_RATE) return samples;
  const ratio = fromRate / TARGET_RATE;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = samples[Math.min(samples.length - 1, Math.floor(i * ratio))];
  }
  return out;
}

function sampleFingerprint(samples) {
  let sum = 0;
  let abs = 0;
  const step = Math.max(1, Math.floor(samples.length / 32));
  for (let i = 0; i < samples.length; i += step) {
    sum += samples[i];
    abs += Math.abs(samples[i]);
  }
  return `${samples.length}:${sum.toFixed(4)}:${abs.toFixed(4)}`;
}

let essentiaPromise = null;
let analyzeChain = Promise.resolve();

function loadEssentia() {
  if (!essentiaPromise) {
    const wasmUrl = new URL("./essentia-wasm.web.wasm", self.location.href).href;
    essentiaPromise = Promise.resolve(
      EssentiaWASM({
        locateFile(file) {
          return file.endsWith(".wasm") ? wasmUrl : file;
        },
      })
    ).then((wasmModule) => new Essentia(wasmModule));
  }
  return essentiaPromise;
}

async function analyzeJob(data) {
  const requestId = data.requestId ?? null;
  const essentia = await loadEssentia();
  const samples = downsample(data.samples, data.sampleRate);
  const fingerprint = sampleFingerprint(samples);
  console.log("[essentia.worker] Analyze start:", {
    requestId,
    sampleRate: data.sampleRate,
    inputSamples: data.samples?.length ?? 0,
    fingerprint,
  });

  const vector = essentia.arrayToVector(samples);
  try {
    const rhythm = essentia.RhythmExtractor2013(vector, MAX_BPM, "degara", MIN_BPM);
    const keyResult = essentia.KeyExtractor(
      vector,
      true,
      4096,
      4096,
      12,
      3500,
      60,
      25,
      0.2,
      "bgate",
      TARGET_RATE
    );

    const bpm = Number(rhythm?.bpm);
    const key = String(keyResult?.key ?? "").trim();
    const scale = String(keyResult?.scale ?? "")
      .trim()
      .toLowerCase();
    const strength = Number(keyResult?.strength);

    console.log("[essentia.worker] Raw output:", {
      requestId,
      fingerprint,
      bpm,
      key,
      scale,
      strength,
      rhythmKeys: rhythm ? Object.keys(rhythm) : [],
    });

    if (!Number.isFinite(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) {
      return { requestId, ok: false, error: "unusable_bpm" };
    }
    if (!key || (scale !== "major" && scale !== "minor")) {
      return { requestId, ok: false, error: "unusable_key" };
    }
    if (Number.isFinite(strength) && strength < MIN_KEY_STRENGTH) {
      return { requestId, ok: false, error: "low_key_strength" };
    }

    return {
      requestId,
      ok: true,
      bpm,
      key,
      scale,
      strength: Number.isFinite(strength) ? strength : 0,
      fingerprint,
    };
  } finally {
    vector.delete?.();
  }
}

self.onmessage = (event) => {
  const data = event.data;
  if (!data || data.type !== "analyze") return;
  const requestId = data.requestId ?? null;

  analyzeChain = analyzeChain
    .then(async () => {
      try {
        self.postMessage(await analyzeJob(data));
      } catch (err) {
        self.postMessage({
          requestId,
          ok: false,
          error: err instanceof Error ? err.message : "essentia_failed",
        });
      }
    })
    .catch((err) => {
      self.postMessage({
        requestId,
        ok: false,
        error: err instanceof Error ? err.message : "essentia_failed",
      });
    });
};
