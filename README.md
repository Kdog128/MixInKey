# MixInKey

Harmonic mix planning for DJs — Camelot compatibility, multi-hop bridge paths, and BPM/key analysis.

Live at [mixinkey.vercel.app](https://mixinkey.vercel.app)

## Features

- **Compatibility** — scores two tracks on Camelot key, BPM, and whatever metadata is available (popularity, duration, genres, release date). No score until both tracks have BPM and key.
- **Camelot wheel** — visual key relationship between the pair.
- **Bridge paths** — when keys do not mix directly, search `tracks_cache` for intermediate tracks within a BPM window.
- **Set planner** — ordered setlist with mix labels between adjacent tracks, plus a recommended next track from the cache (Camelot, BPM, genre overlap, release-year proximity).

## Architecture

- Next.js 16 / Supabase / Vercel.
- Six-provider fallback chain with read-through caching and negative caching: ReccoBeats → GetSongBPM → SoundNet → MusicBrainz for BPM/key, Last.fm for genres, Deezer for preview audio. Hits and misses land in `tracks_cache`.
- Client-side BPM and key detection via Essentia.js (WASM) in a Web Worker when no provider has the track. WASM is not on the server 6s features path.

## Notes

Spotify deprecated third-party access to `/v1/audio-features`, so MixInKey cannot read BPM or key from Spotify. External providers are incomplete and rate-limited; the Deezer preview + Essentia path exists for tracks those APIs do not cover. Essentia is local analysis of a 30-second preview, not a substitute for a full-file key/BPM scan.
