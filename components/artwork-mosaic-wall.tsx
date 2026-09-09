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
import { useDocumentVisible } from "@/lib/use-document-visible";

interface ArtworkMosaicWallProps {
  active?: boolean;
  className?: string;
}

const TILE_COUNT = 72;
const IMAGE_OPACITY = 0.19;
const CROSSFADE_MS = 1000;
const ARTWORK_FETCH_LIMIT = 500;

function dedupeArtworkUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of urls) {
    const url = raw?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push(url);
  }
  return unique;
}

/** Persist artwork URLs across client navigations so the mosaic does not refetch/reset. */
let cachedArtworkUrls: string[] | null = null;
let artworkFetchPromise: Promise<string[]> | null = null;

async function fetchArtworkUrls(): Promise<string[]> {
  if (cachedArtworkUrls) return cachedArtworkUrls;
  if (artworkFetchPromise) return artworkFetchPromise;

  artworkFetchPromise = (async () => {
    try {
      const res = await fetch(`/api/tracks/artwork-wall?limit=${ARTWORK_FETCH_LIMIT}`);
      const data = (await res.json()) as {
        artwork_urls?: string[];
        unique_count?: number;
        count?: number;
      };
      if (res.ok && Array.isArray(data.artwork_urls)) {
        cachedArtworkUrls = dedupeArtworkUrls(data.artwork_urls);
        console.log("[mosaic] Fetched artwork URLs:", {
          apiReportedUnique: data.unique_count ?? data.count ?? data.artwork_urls.length,
          clientUniqueAfterDedupe: cachedArtworkUrls.length,
          rawFromApi: data.artwork_urls.length,
        });
        return cachedArtworkUrls;
      }
    } catch (err) {
      console.warn("[mosaic] Artwork fetch failed:", err);
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

function pickUrlAvoiding(
  pool: string[],
  forbidden: Set<string>,
  exclude?: string
): string {
  if (pool.length === 0) return "";

  const blocked = new Set(forbidden);
  if (exclude) blocked.add(exclude);

  const unused = pool.filter((url) => !blocked.has(url));
  if (unused.length > 0) {
    return unused[Math.floor(Math.random() * unused.length)];
  }

  // Pool smaller than the wall: never repeat the tile's current cover if possible.
  if (exclude && pool.length > 1) {
    const withoutExclude = pool.filter((url) => url !== exclude);
    if (withoutExclude.length > 0) {
      return withoutExclude[Math.floor(Math.random() * withoutExclude.length)];
    }
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

/** Build tile assignments: use all unique URLs first when possible, else expand then Fisher-Yates shuffle. */
function expandAndShuffleAssignments(uniqueUrls: string[], tileCount: number): string[] {
  if (uniqueUrls.length === 0) return [];

  if (uniqueUrls.length >= tileCount) {
    return shuffleArray([...uniqueUrls]).slice(0, tileCount);
  }

  const expanded: string[] = [];
  while (expanded.length < tileCount) {
    expanded.push(...uniqueUrls);
  }

  return shuffleArray(expanded.slice(0, tileCount));
}

function buildInitialPairs(
  assignments: string[],
  pool: string[]
): { urlA: string; urlB: string }[] {
  const usedOnScreen = new Set(assignments);
  return assignments.map((urlA) => {
    const urlB = pickUrlAvoiding(pool, usedOnScreen, urlA);
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
  const reservedUrlsRef = useRef<Map<number, string>>(new Map());
  const fadingOutUntilRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const next = new Map<number, string>();
    initialPairs.forEach((pair, tileIndex) => {
      next.set(tileIndex, pair.urlA);
    });
    visibleUrlsRef.current = next;
    reservedUrlsRef.current = new Map();
    fadingOutUntilRef.current = new Map();
  }, [initialPairs]);

  const getUsedOnScreen = useCallback((tileIndex: number): Set<string> => {
    const used = new Set<string>();
    const now = Date.now();

    for (const [index, url] of visibleUrlsRef.current) {
      if (index !== tileIndex && url) used.add(url);
    }
    for (const [index, url] of reservedUrlsRef.current) {
      if (index !== tileIndex && url) used.add(url);
    }
    for (const [url, until] of fadingOutUntilRef.current) {
      if (until > now) used.add(url);
      else fadingOutUntilRef.current.delete(url);
    }
    return used;
  }, []);

  const pickCycleUrl = useCallback(
    (tileIndex: number, exclude?: string): string => {
      const next = pickUrlAvoiding(shuffledUrls, getUsedOnScreen(tileIndex), exclude);
      reservedUrlsRef.current.set(tileIndex, next);
      return next;
    },
    [shuffledUrls, getUsedOnScreen]
  );

  const setVisibleUrl = useCallback((tileIndex: number, url: string) => {
    const previous = visibleUrlsRef.current.get(tileIndex);
    visibleUrlsRef.current.set(tileIndex, url);
    if (reservedUrlsRef.current.get(tileIndex) === url) {
      reservedUrlsRef.current.delete(tileIndex);
    }
    if (previous && previous !== url) {
      fadingOutUntilRef.current.set(previous, Date.now() + CROSSFADE_MS);
    }
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
  /** Fresh random seed each mount so tile order is never memoized across page loads. */
  const [layoutSeed] = useState(() => Math.random());
  const cols = useMosaicGridCols();
  const documentVisible = useDocumentVisible();

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    void fetchArtworkUrls().then((urls) => {
      if (!cancelled) setArtworkUrls(dedupeArtworkUrls(urls));
    });

    return () => {
      cancelled = true;
    };
  }, [active]);

  const gridLayout = useMemo(() => {
    const uniqueUrls = dedupeArtworkUrls(artworkUrls);
    if (uniqueUrls.length === 0) return null;

    const assignments = expandAndShuffleAssignments(uniqueUrls, TILE_COUNT);
    const initialPairs = buildInitialPairs(assignments, uniqueUrls);

    const assignmentCounts = new Map<string, number>();
    for (const url of assignments) {
      assignmentCounts.set(url, (assignmentCounts.get(url) ?? 0) + 1);
    }

    console.log("[mosaic] Grid layout:", {
      layoutSeed,
      uniquePoolSize: uniqueUrls.length,
      tileCount: TILE_COUNT,
      cols,
      maxRepeatCount: Math.max(...assignmentCounts.values()),
      firstEightTiles: assignments.slice(0, 8),
    });

    return { uniqueUrls, initialPairs };
  }, [artworkUrls, cols, layoutSeed]);

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
          shuffledUrls={gridLayout.uniqueUrls}
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
                canCycle={gridLayout.uniqueUrls.length > 1 && documentVisible}
              />
            ))}
          </div>
        </MosaicGridProvider>
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-0% via-background/10 via-75% to-background/90 to-100%" />
    </div>
  );
}
