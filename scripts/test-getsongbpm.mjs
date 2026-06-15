import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
const envText = readFileSync(envPath, "utf8");
const apiKey = envText.match(/^GETSONGBPM_API_KEY=(.+)$/m)?.[1]?.trim();

if (!apiKey) {
  console.error("GETSONGBPM_API_KEY not found in .env.local");
  process.exit(1);
}

const API_BASE = "https://api.getsong.co";

async function testLookup(label, lookup, type = "song") {
  const url = `${API_BASE}/search/?${new URLSearchParams({
    api_key: apiKey,
    type,
    lookup,
  }).toString()}`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const bodyText = await res.text();

  let resultCount = 0;
  let hasError = false;
  let daftPunkMatch = null;

  try {
    const data = JSON.parse(bodyText);
    if (data.search?.error) {
      hasError = true;
    } else if (Array.isArray(data.search)) {
      resultCount = data.search.length;
      daftPunkMatch = data.search.find(
        (i) =>
          i.title?.toLowerCase().includes("one more time") &&
          i.artist?.name?.toLowerCase().includes("daft punk")
      );
    }
  } catch {
    /* ignore */
  }

  console.log(`\n=== ${label} ===`);
  console.log(`type=${type}, lookup="${lookup}"`);
  console.log(`Status: ${res.status} | Results: ${resultCount} | Error: ${hasError}`);
  if (daftPunkMatch) {
    console.log("Daft Punk match:", {
      title: daftPunkMatch.title,
      artist: daftPunkMatch.artist?.name,
      tempo: daftPunkMatch.tempo,
      key_of: daftPunkMatch.key_of,
    });
  }
  console.log("Raw (first 400 chars):", bodyText.slice(0, 400));
}

console.log("Testing Daft Punk - One More Time lookup formats\n");

await testLookup(
  "1) song:TITLE artist:ARTIST (space)",
  "song:One More Time artist:Daft Punk",
  "both"
);
await testLookup("1b) same with type=song", "song:One More Time artist:Daft Punk", "song");
await testLookup("2) title only", "One More Time", "song");
await testLookup("3) song:TITLE", "song:One More Time", "song");

// Current broken format for comparison
await testLookup(
  "OLD) song:TITLE+artist:ARTIST (plus)",
  "song:One More Time+artist:Daft Punk",
  "both"
);
