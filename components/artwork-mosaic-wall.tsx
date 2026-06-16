"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ArtworkMosaicWallProps {
  active?: boolean;
  className?: string;
}

const TILE_COUNT = 72;
const IMAGE_OPACITY = 0.19;
const CROSSFADE_MS = 1000;

function pickRandomUrl(urls: string[], exclude?: string): string {
  if (urls.length === 0) return "";
  if (urls.length === 1) return urls[0];

  let next = urls[Math.floor(Math.random() * urls.length)];
  while (exclude && next === exclude) {
    next = urls[Math.floor(Math.random() * urls.length)];
  }
  return next;
}

function CyclingTile({ urls, tileIndex }: { urls: string[]; tileIndex: number }) {
  const [urlA, setUrlA] = useState(() => urls[tileIndex % urls.length]);
  const [urlB, setUrlB] = useState(() => urls[(tileIndex + 1) % urls.length]);
  const [showB, setShowB] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const showBRef = useRef(showB);
  const urlARef = useRef(urlA);
  const urlBRef = useRef(urlB);

  useEffect(() => {
    showBRef.current = showB;
  }, [showB]);

  useEffect(() => {
    urlARef.current = urlA;
  }, [urlA]);

  useEffect(() => {
    urlBRef.current = urlB;
  }, [urlB]);

  useEffect(() => {
    if (urls.length <= 1) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleCycle = () => {
      const delay = 8000 + Math.random() * 4000;
      timeoutId = setTimeout(() => {
        if (cancelled) return;

        if (showBRef.current) {
          setUrlA(pickRandomUrl(urls, urlBRef.current));
          setShowB(false);
        } else {
          setUrlB(pickRandomUrl(urls, urlARef.current));
          setShowB(true);
        }

        scheduleCycle();
      }, delay);
    };

    const initialDelay = 500 + ((tileIndex * 347) % 2200);
    timeoutId = setTimeout(scheduleCycle, initialDelay);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [urls, tileIndex]);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-sm">
      <img
        src={urlA}
        alt=""
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 size-full object-cover transition-opacity ease-in-out"
        style={{
          opacity: loaded ? (showB ? 0 : IMAGE_OPACITY) : 0,
          transitionDuration: `${CROSSFADE_MS}ms`,
        }}
      />
      <img
        src={urlB}
        alt=""
        decoding="async"
        referrerPolicy="no-referrer"
        className="absolute inset-0 size-full object-cover transition-opacity ease-in-out"
        style={{
          opacity: showB ? IMAGE_OPACITY : 0,
          transitionDuration: `${CROSSFADE_MS}ms`,
        }}
      />
    </div>
  );
}

export function ArtworkMosaicWall({ active = true, className }: ArtworkMosaicWallProps) {
  const [artworkUrls, setArtworkUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function loadArtwork() {
      try {
        const res = await fetch("/api/tracks/artwork-wall?limit=30");
        const data = (await res.json()) as { artwork_urls?: string[] };
        if (!cancelled && res.ok && Array.isArray(data.artwork_urls)) {
          setArtworkUrls(data.artwork_urls.filter((url) => url?.trim()));
        }
      } catch {
        if (!cancelled) setArtworkUrls([]);
      }
    }

    void loadArtwork();

    return () => {
      cancelled = true;
    };
  }, [active]);

  const tiles = useMemo(() => {
    if (artworkUrls.length === 0) return [];
    return Array.from({ length: TILE_COUNT }, (_, index) => index);
  }, [artworkUrls]);

  if (!active || artworkUrls.length === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-y-0 left-16 right-0 z-0 overflow-hidden",
        className
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-0 grid grid-cols-6 gap-2 p-3 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
        {tiles.map((tileIndex) => (
          <CyclingTile key={tileIndex} urls={artworkUrls} tileIndex={tileIndex} />
        ))}
      </div>

      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-0% via-background/10 via-75% to-background/90 to-100%" />
    </div>
  );
}
