import { cn } from "@/lib/utils";

/** Geist sans — footer attribution line and source badges. */
const SOURCE_FOOTER_FONT_CLASS = "font-sans";

const SOURCE_BADGE_STYLES = {
  spotify: "border-emerald-500/35 bg-emerald-500/10 text-emerald-400",
  reccobeats: "border-[#a855f7]/35 bg-[#a855f7]/10 text-[#c084fc]",
  soundnet: "border-blue-500/35 bg-blue-500/10 text-blue-400",
  getsongbpm: "border-amber-500/35 bg-amber-500/10 text-amber-400",
  lastfm: "border-red-500/35 bg-red-500/10 text-red-400",
} as const;

type SourceTooltipAccent = "green" | "blue" | "red";

const SOURCE_TOOLTIP_ACCENT_STYLES: Record<SourceTooltipAccent, string> = {
  green: "border-emerald-500/50 bg-emerald-950 text-emerald-400",
  blue: "border-blue-500/50 bg-blue-950 text-blue-400",
  red: "border-red-500/50 bg-red-950 text-red-400",
};

const SOURCE_TOOLTIP_SHADOW =
  "shadow-[0_8px_24px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.35)]";

function SourceBadge({
  children,
  badgeStyle,
}: {
  children: React.ReactNode;
  badgeStyle: (typeof SOURCE_BADGE_STYLES)[keyof typeof SOURCE_BADGE_STYLES];
}) {
  return (
    <span
      className={cn(
        SOURCE_FOOTER_FONT_CLASS,
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-normal whitespace-nowrap",
        badgeStyle
      )}
    >
      {children}
    </span>
  );
}

function SourceCategoryTooltip({
  label,
  accent,
  id,
}: {
  label: string;
  accent: SourceTooltipAccent;
  id: string;
}) {
  const accentStyle = SOURCE_TOOLTIP_ACCENT_STYLES[accent];

  return (
    <div
      id={id}
      role="tooltip"
      className={cn(
        "pointer-events-none absolute top-[calc(100%+12px)] left-1/2 z-[100] -translate-x-1/2",
        "opacity-0 transition-opacity duration-150",
        "group-hover/badge:opacity-100 group-focus-within/badge:opacity-100"
      )}
    >
      <div
        className={cn(
          "rounded-lg border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap",
          SOURCE_TOOLTIP_SHADOW,
          accentStyle
        )}
      >
        {label}
      </div>
    </div>
  );
}

function SourceBadgeHoverGroup({
  tooltipLabel,
  accent,
  tooltipId,
  children,
}: {
  tooltipLabel: string;
  accent: SourceTooltipAccent;
  tooltipId: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="group/badge relative inline-flex items-center"
      tabIndex={0}
      aria-describedby={tooltipId}
    >
      {children}
      <SourceCategoryTooltip label={tooltipLabel} accent={accent} id={tooltipId} />
    </span>
  );
}

export function SourceBadgesFooter() {
  return (
    <footer
      className={cn(
        SOURCE_FOOTER_FONT_CLASS,
        "relative z-30 shrink-0 overflow-visible"
      )}
    >
      <p className="mb-2.5 text-center text-[10px] text-zinc-400/90">
        Next.js · Spotify API · Supabase
      </p>
      <p className="flex min-h-[1.75rem] flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-center text-xs leading-normal">
        <span className="inline-flex items-center gap-2">
          <span className="text-zinc-400/90">Live APIs</span>
          <SourceBadgeHoverGroup tooltipLabel="Tracks" accent="green" tooltipId="source-tooltip-tracks">
            <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.spotify}>Spotify</SourceBadge>
          </SourceBadgeHoverGroup>
          <SourceBadgeHoverGroup
            tooltipLabel="BPM & Key"
            accent="blue"
            tooltipId="source-tooltip-bpm-key"
          >
            <span className="inline-flex items-center gap-1">
              <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.reccobeats}>ReccoBeats</SourceBadge>
              <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.soundnet}>SoundNet</SourceBadge>
              <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.getsongbpm}>GetSongBPM</SourceBadge>
            </span>
          </SourceBadgeHoverGroup>
          <SourceBadgeHoverGroup tooltipLabel="Genres" accent="red" tooltipId="source-tooltip-genres">
            <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.lastfm}>Last.fm</SourceBadge>
          </SourceBadgeHoverGroup>
        </span>
      </p>
    </footer>
  );
}
