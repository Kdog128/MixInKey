"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface ArtworkMosaicWallProps {
  active?: boolean;
  className?: string;
}

const TILE_COUNT = 72;
const IMAGE_OPACITY = 0.09;

function MosaicTile({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-sm">
      <img
        src={url}
        alt=""
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(false)}
        className={cn(
          "size-full object-cover transition-opacity duration-700 ease-out",
          loaded ? "opacity-[var(--mosaic-opacity)]" : "opacity-0"
        )}
        style={{ "--mosaic-opacity": IMAGE_OPACITY } as React.CSSProperties}
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
    return Array.from({ length: TILE_COUNT }, (_, index) => ({
      key: `${artworkUrls[index % artworkUrls.length]}-${index}`,
      url: artworkUrls[index % artworkUrls.length],
    }));
  }, [artworkUrls]);

  if (!active || tiles.length === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-y-0 left-16 right-0 z-0 overflow-hidden",
        className
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-0 grid grid-cols-6 gap-2 p-3 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
        {tiles.map(({ key, url }) => (
          <MosaicTile key={key} url={url} />
        ))}
      </div>

      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/70 via-65% to-background" />
    </div>
  );
}
