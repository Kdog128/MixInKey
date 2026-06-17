"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

interface ArtworkMosaicWallProps {
  active?: boolean;
  className?: string;
}

const TILE_COUNT = 72;
const IMAGE_OPACITY = 0.19;
const CROSSFADE_MS = 1000;

/** Persist artwork URLs across client navigations so the mosaic does not refetch/reset. */
let cachedArtworkUrls: string[] | null = null;
let artworkFetchPromise: Promise<string[]> | null = null;

async function fetchArtworkUrls(): Promise<string[]> {
  if (cachedArtworkUrls) return cachedArtworkUrls;
  if (artworkFetchPromise) return artworkFetchPromise;

  artworkFetchPromise = (async () => {
    try {
      const res = await fetch("/api/tracks/artwork-wall?limit=30");
      const data = (await res.json()) as { artwork_urls?: string[] };
      if (res.ok && Array.isArray(data.artwork_urls)) {
        cachedArtworkUrls = data.artwork_urls.filter((url) => url?.trim());
        return cachedArtworkUrls;
      }
    } catch {
      // fall through
    }
    cachedArtworkUrls = [];
    return cachedArtworkUrls;
  })();

  return artworkFetchPromise;
}

function shuffleArray<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getGridCols(width: number): number {
  if (width >= 1024) return 12;
  if (width >= 768) return 10;
  if (width >= 640) return 8;
  return 6;
}

function useMosaicGridCols(): number {
  const [cols, setCols] = useState(6);

  useEffect(() => {
    const update = () => setCols(getGridCols(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return cols;
}

function getNeighborIndices(tileIndex: number, cols: number, total: number): number[] {
  const row = Math.floor(tileIndex / cols);
  const col = tileIndex % cols;
  const neighbors: number[] = [];

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || c >= cols) continue;
      const idx = r * cols + c;
      if (idx < total) neighbors.push(idx);
    }
  }

  return neighbors;
}

function pickUrlAvoiding(
  pool: string[],
  forbidden: Set<string>,
  exclude?: string
): string {
  if (pool.length === 0) return "";

  let candidates = pool.filter((url) => !forbidden.has(url) && url !== exclude);
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  candidates = pool.filter((url) => !forbidden.has(url));
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  if (exclude && pool.length > 1) {
    const withoutExclude = pool.filter((url) => url !== exclude);
    if (withoutExclude.length > 0) {
      return withoutExclude[Math.floor(Math.random() * withoutExclude.length)];
    }
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

/** Duplicate unique URLs until tileCount, then Fisher-Yates shuffle for initial spread. */
function expandAndShuffleAssignments(uniqueUrls: string[], tileCount: number): string[] {
  if (uniqueUrls.length === 0) return [];

  const expanded: string[] = [];
  while (expanded.length < tileCount) {
    expanded.push(...uniqueUrls);
  }

  return shuffleArray(expanded.slice(0, tileCount));
}

function buildInitialPairs(
  assignments: string[],
  pool: string[],
  cols: number,
  tileCount: number
): { urlA: string; urlB: string }[] {
  return assignments.map((urlA, tileIndex) => {
    const forbidden = new Set<string>([urlA]);
    for (const neighborIndex of getNeighborIndices(tileIndex, cols, tileCount)) {
      const neighborUrl = assignments[neighborIndex];
      if (neighborUrl) forbidden.add(neighborUrl);
    }
    const urlB = pickUrlAvoiding(pool, forbidden, urlA);
    return { urlA, urlB };
  });
}

interface MosaicGridContextValue {
  cols: number;
  shuffledUrls: string[];
  pickCycleUrl: (tileIndex: number, exclude?: string) => string;
  setVisibleUrl: (tileIndex: number, url: string) => void;
}

const MosaicGridContext = createContext<MosaicGridContextValue | null>(null);

function useMosaicGrid(): MosaicGridContextValue {
  const context = useContext(MosaicGridContext);
  if (!context) {
    throw new Error("CyclingTile must be used within ArtworkMosaicWall");
  }
  return context;
}

function MosaicGridProvider({
  shuffledUrls,
  cols,
  initialPairs,
  children,
}: {
  shuffledUrls: string[];
  cols: number;
  initialPairs: { urlA: string; urlB: string }[];
  children: React.ReactNode;
}) {
  const visibleUrlsRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    const next = new Map<number, string>();
    initialPairs.forEach((pair, tileIndex) => {
      next.set(tileIndex, pair.urlA);
    });
    visibleUrlsRef.current = next;
  }, [initialPairs]);

  const getForbiddenNeighborUrls = useCallback(
    (tileIndex: number): Set<string> => {
      const forbidden = new Set<string>();
      for (const neighborIndex of getNeighborIndices(tileIndex, cols, TILE_COUNT)) {
        const neighborUrl = visibleUrlsRef.current.get(neighborIndex);
        if (neighborUrl) forbidden.add(neighborUrl);
      }
      return forbidden;
    },
    [cols]
  );

  const pickCycleUrl = useCallback(
    (tileIndex: number, exclude?: string): string => {
      return pickUrlAvoiding(shuffledUrls, getForbiddenNeighborUrls(tileIndex), exclude);
    },
    [shuffledUrls, getForbiddenNeighborUrls]
  );

  const setVisibleUrl = useCallback((tileIndex: number, url: string) => {
    visibleUrlsRef.current.set(tileIndex, url);
  }, []);

  const value = useMemo(
    () => ({ cols, shuffledUrls, pickCycleUrl, setVisibleUrl }),
    [cols, shuffledUrls, pickCycleUrl, setVisibleUrl]
  );

  return <MosaicGridContext.Provider value={value}>{children}</MosaicGridContext.Provider>;
}

function CyclingTile({
  tileIndex,
  initialUrlA,
  initialUrlB,
  canCycle,
}: {
  tileIndex: number;
  initialUrlA: string;
  initialUrlB: string;
  canCycle: boolean;
}) {
  const { pickCycleUrl, setVisibleUrl } = useMosaicGrid();
  const [urlA, setUrlA] = useState(initialUrlA);
  const [urlB, setUrlB] = useState(initialUrlB);
  const [showB, setShowB] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const showBRef = useRef(showB);
  const urlARef = useRef(urlA);
  const urlBRef = useRef(urlB);

  useEffect(() => {
    setUrlA(initialUrlA);
    setUrlB(initialUrlB);
    setShowB(false);
    setLoaded(false);
  }, [initialUrlA, initialUrlB]);

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
    setVisibleUrl(tileIndex, showB ? urlB : urlA);
  }, [tileIndex, showB, urlA, urlB, setVisibleUrl]);

  useEffect(() => {
    if (!canCycle) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleCycle = () => {
      const delay = 8000 + Math.random() * 4000;
      timeoutId = setTimeout(() => {
        if (cancelled) return;

        if (showBRef.current) {
          setUrlA(pickCycleUrl(tileIndex, urlBRef.current));
          setShowB(false);
        } else {
          setUrlB(pickCycleUrl(tileIndex, urlARef.current));
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
  }, [tileIndex, pickCycleUrl, canCycle]);

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
  const [artworkUrls, setArtworkUrls] = useState<string[]>(() => cachedArtworkUrls ?? []);
  const cols = useMosaicGridCols();

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    void fetchArtworkUrls().then((urls) => {
      if (!cancelled) setArtworkUrls(urls);
    });

    return () => {
      cancelled = true;
    };
  }, [active]);

  const gridLayout = useMemo(() => {
    if (artworkUrls.length === 0) return null;
    const assignments = expandAndShuffleAssignments(artworkUrls, TILE_COUNT);
    const initialPairs = buildInitialPairs(assignments, artworkUrls, cols, TILE_COUNT);
    return { artworkUrls, initialPairs };
  }, [artworkUrls, cols]);

  if (!active) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-y-0 left-16 right-0 z-0 overflow-hidden isolate",
        className
      )}
      style={{ contain: "strict" }}
      aria-hidden="true"
    >
      {gridLayout ? (
        <MosaicGridProvider
          shuffledUrls={gridLayout.artworkUrls}
          cols={cols}
          initialPairs={gridLayout.initialPairs}
        >
          <div className="absolute inset-0 grid grid-cols-6 gap-2 p-3 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
            {gridLayout.initialPairs.map((pair, tileIndex) => (
              <CyclingTile
                key={tileIndex}
                tileIndex={tileIndex}
                initialUrlA={pair.urlA}
                initialUrlB={pair.urlB}
                canCycle={artworkUrls.length > 1}
              />
            ))}
          </div>
        </MosaicGridProvider>
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-0% via-background/10 via-75% to-background/90 to-100%" />
    </div>
  );
}
