import { cn } from "@/lib/utils";

/** Geist sans — footer attribution line and source badges. */
const SOURCE_FOOTER_FONT_CLASS = "font-sans";

const SOURCE_BADGE_STYLES = {
  spotify: "border-[#1DB954]/40 bg-[#1DB954]/12 text-[#1DB954]",
  deezer: "border-[#ff0092]/45 bg-[#ff0092]/14 text-[#ff4db8]",
  reccobeats: "border-[#00C7F2]/40 bg-[#00C7F2]/12 text-[#5DDBF7]",
  soundnet: "border-blue-500/35 bg-blue-500/10 text-blue-400",
  getsongbpm: "border-amber-500/35 bg-amber-500/10 text-amber-400",
  lastfm: "border-[#D51007]/45 bg-[#D51007]/14 text-[#FF6B63]",
} as const;

type SourceTooltipAccent = "spotify" | "deezer" | "cyan" | "blue" | "lastfm";

const SOURCE_TOOLTIP_ACCENT_STYLES: Record<SourceTooltipAccent, string> = {
  spotify: "border-[#1DB954]/50 bg-[#052e16] text-[#1DB954]",
  deezer: "border-[#ff0092]/50 bg-[#3b0624] text-[#ff4db8]",
  cyan: "border-[#00C7F2]/50 bg-[#042a33] text-[#5DDBF7]",
  blue: "border-blue-500/50 bg-blue-950 text-blue-400",
  lastfm: "border-[#D51007]/50 bg-[#3b0705] text-[#FF6B63]",
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
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-normal whitespace-nowrap",
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
    <div
      className="group/badge relative inline-flex shrink-0 items-center"
      tabIndex={0}
      aria-describedby={tooltipId}
    >
      {children}
      <SourceCategoryTooltip label={tooltipLabel} accent={accent} id={tooltipId} />
    </div>
  );
}

export function SourceBadgesFooter() {
  return (
    <footer
      className={cn(
        SOURCE_FOOTER_FONT_CLASS,
        "relative z-30 w-full min-w-0 max-w-full shrink-0 overflow-visible"
      )}
    >
      <p className="mb-2.5 text-center text-[10px] text-zinc-400/90">
        Next.js · Spotify API · Supabase · Essentia.js
      </p>
      <div className="flex min-h-[1.75rem] w-full min-w-0 max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-1.5 text-center text-xs leading-normal">
        <span className="shrink-0 text-zinc-400/90">Live APIs</span>
        <SourceBadgeHoverGroup tooltipLabel="Tracks" accent="spotify" tooltipId="source-tooltip-tracks">
          <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.spotify}>Spotify</SourceBadge>
        </SourceBadgeHoverGroup>
        <SourceBadgeHoverGroup
          tooltipLabel="Preview Audio"
          accent="deezer"
          tooltipId="source-tooltip-preview-deezer"
        >
          <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.deezer}>Deezer</SourceBadge>
        </SourceBadgeHoverGroup>
        <SourceBadgeHoverGroup
          tooltipLabel="BPM & Key"
          accent="cyan"
          tooltipId="source-tooltip-bpm-key-reccobeats"
        >
          <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.reccobeats}>ReccoBeats</SourceBadge>
        </SourceBadgeHoverGroup>
        <SourceBadgeHoverGroup
          tooltipLabel="BPM & Key"
          accent="blue"
          tooltipId="source-tooltip-bpm-key-soundnet"
        >
          <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.soundnet}>SoundNet</SourceBadge>
        </SourceBadgeHoverGroup>
        <SourceBadgeHoverGroup
          tooltipLabel="BPM & Key"
          accent="blue"
          tooltipId="source-tooltip-bpm-key-getsongbpm"
        >
          <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.getsongbpm}>GetSongBPM</SourceBadge>
        </SourceBadgeHoverGroup>
        <SourceBadgeHoverGroup tooltipLabel="Genres" accent="lastfm" tooltipId="source-tooltip-genres">
          <SourceBadge badgeStyle={SOURCE_BADGE_STYLES.lastfm}>Last.fm</SourceBadge>
        </SourceBadgeHoverGroup>
      </div>
    </footer>
  );
}
