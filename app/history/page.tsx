"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, Music } from "lucide-react";
import { CamelotBadge } from "@/components/mix-badges";
import { PageHeader } from "@/components/page-header";
import { SourceBadgesFooter } from "@/components/source-badges-footer";
import { compatibilityPairHref } from "@/lib/compatibility-pair";
import { getCompatibilityScoreStyle } from "@/lib/compatibility-score";
import { formatRelativeTime } from "@/lib/relative-time";
import { visitorFetch } from "@/lib/visitor-id";
import {
  COHESIVE_INNER_CARD_CLASS,
  PAGE_CONTENT_CLASS,
  PAGE_SECTION_CARD_CLASS,
  cohesiveCardStyle,
  cohesiveSurfaceStyle,
} from "@/lib/ui-surfaces";
import { cn } from "@/lib/utils";

interface HistoryTrack {
  spotify_id: string;
  name: string;
  artist: string;
  image: string | null;
  camelot: string | null;
}

interface HistoryItem {
  id: string;
  score: number | null;
  compared_at: string;
  track1: HistoryTrack;
  track2: HistoryTrack;
}

function Artwork({ image, name }: { image: string | null; name: string }) {
  return (
    <div
      className={cn(
        "relative size-12 flex-shrink-0 overflow-hidden rounded-lg border border-border",
        COHESIVE_INNER_CARD_CLASS
      )}
      style={cohesiveSurfaceStyle()}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={name} className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Music className="size-5 text-muted-foreground/50" />
        </div>
      )}
    </div>
  );
}

function HistoryRow({
  item,
  onOpen,
}: {
  item: HistoryItem;
  onOpen: (item: HistoryItem) => void;
}) {
  const scoreStyle =
    item.score != null ? getCompatibilityScoreStyle(item.score) : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="flex w-full items-center gap-3 border-b border-border/50 px-4 py-3 text-left last:border-b-0 transition-colors hover:bg-white/[0.03]"
    >
      <div className="flex flex-shrink-0 items-center">
        <Artwork image={item.track1.image} name={item.track1.name} />
        <div className="-ml-2">
          <Artwork image={item.track2.image} name={item.track2.name} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground" title={item.track1.name}>
          {item.track1.name}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={item.track1.artist}>
          {item.track1.artist}
        </p>
        <p
          className="mt-1 truncate text-sm font-medium text-foreground"
          title={item.track2.name}
        >
          {item.track2.name}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={item.track2.artist}>
          {item.track2.artist}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
          {item.track1.camelot ? (
            <CamelotBadge label={item.track1.camelot} />
          ) : (
            <span className="text-xs font-mono text-muted-foreground">—</span>
          )}
          <span className="text-[11px] text-muted-foreground">/</span>
          {item.track2.camelot ? (
            <CamelotBadge label={item.track2.camelot} />
          ) : (
            <span className="text-xs font-mono text-muted-foreground">—</span>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4">
        {scoreStyle && item.score != null ? (
          <span
            className="inline-flex min-w-[2.5rem] items-center justify-center rounded-full border px-2 py-0.5 text-sm font-semibold tabular-nums"
            style={{
              color: scoreStyle.color,
              borderColor: `${scoreStyle.color}55`,
              backgroundColor: `${scoreStyle.color}18`,
            }}
            title={scoreStyle.label}
          >
            {item.score}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}

        <div className="hidden items-center gap-1.5 sm:flex">
          {item.track1.camelot ? (
            <CamelotBadge label={item.track1.camelot} />
          ) : (
            <span className="text-xs font-mono text-muted-foreground">—</span>
          )}
          <span className="text-[11px] text-muted-foreground">/</span>
          {item.track2.camelot ? (
            <CamelotBadge label={item.track2.camelot} />
          ) : (
            <span className="text-xs font-mono text-muted-foreground">—</span>
          )}
        </div>

        <span className="w-[6.5rem] text-right text-[11px] text-muted-foreground">
          {formatRelativeTime(item.compared_at)}
        </span>
      </div>
    </button>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await visitorFetch("/api/history");
        const data = (await res.json()) as { items?: HistoryItem[] };
        if (!cancelled) {
          setItems(Array.isArray(data.items) ? data.items : []);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleOpen(item: HistoryItem) {
    router.push(compatibilityPairHref(item.track1.spotify_id, item.track2.spotify_id));
  }

  return (
    <main className="min-h-screen font-sans">
      <div className={cn(PAGE_CONTENT_CLASS, "gap-4")}>
        <PageHeader icon="clock" title="History" />

        <section
          className={cn(PAGE_SECTION_CARD_CLASS, "flex flex-col overflow-hidden p-0")}
          style={cohesiveCardStyle()}
        >
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Clock className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-4 text-sm text-muted-foreground">
                No comparisons yet — analyze a pair on Compatibility to start a history.
              </p>
            </div>
          ) : (
            <div>
              <div className="hidden border-b border-border/50 px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)_3.5rem_7.5rem_6.5rem] sm:items-center sm:gap-3">
                <span aria-hidden="true" />
                <span>Tracks</span>
                <span className="text-right">Score</span>
                <span className="text-right">Camelot</span>
                <span className="text-right">When</span>
              </div>
              {items.map((item) => (
                <HistoryRow key={item.id} item={item} onOpen={handleOpen} />
              ))}
            </div>
          )}

          <div className="border-t border-border/50 px-4 py-3">
            <SourceBadgesFooter />
          </div>
        </section>
      </div>
    </main>
  );
}
