import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** Copy essentia.js browser WASM assets into /public so the worker can load them
 * without going through Turbopack (the .es.js glue still `require("fs")`). */
function copyEssentiaPublicAssets() {
  const dist = path.join(projectRoot, "node_modules/essentia.js/dist");
  const dest = path.join(projectRoot, "public/essentia");
  fs.mkdirSync(dest, { recursive: true });
  for (const file of [
    "essentia-wasm.web.js",
    "essentia-wasm.web.wasm",
    "essentia.js-core.umd.js",
  ]) {
    const from = path.join(dist, file);
    const to = path.join(dest, file);
    if (!fs.existsSync(from)) {
      throw new Error(`Missing Essentia asset: ${from}`);
    }
    const srcStat = fs.statSync(from);
    let needsCopy = true;
    try {
      const destStat = fs.statSync(to);
      needsCopy = destStat.size !== srcStat.size || destStat.mtimeMs < srcStat.mtimeMs;
    } catch {
      needsCopy = true;
    }
    if (needsCopy) fs.copyFileSync(from, to);
  }

  // The web glue is ENVIRONMENT=web, so ENVIRONMENT_IS_WORKER is false and it
  // reads document.currentScript unguarded. Patch that so classic workers boot.
  const webJsPath = path.join(dest, "essentia-wasm.web.js");
  const webJs = fs.readFileSync(webJsPath, "utf8");
  const patched = webJs.replaceAll(
    "else if(document.currentScript)",
    'else if(typeof document!=="undefined"&&document.currentScript)'
  );
  if (patched !== webJs) fs.writeFileSync(webJsPath, patched);
}

copyEssentiaPublicAssets();

/** @type {import('next').NextConfig} */
// DJ Track Compatibility Tool
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: projectRoot,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.scdn.co",
      },
    ],
  },
  allowedDevOrigins: ["*.vusercontent.net"],
}

export default nextConfig
