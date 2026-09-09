import { getKeyCompatStyle, type TransitionAnalysis } from "@/lib/camelot";
import { cn } from "@/lib/utils";

export function MixBadge({ transition }: { transition: TransitionAnalysis }) {
  const style = getKeyCompatStyle(transition.keyCompat.type);

  return (
    <span className="relative group inline-flex">
      <span
        className="inline-flex items-center justify-center max-w-[7.5rem] px-2.5 py-1 rounded-full border text-[11px] font-semibold truncate cursor-default"
        style={{
          color: style.color,
          backgroundColor: style.bg,
          borderColor: style.border,
        }}
      >
        {transition.energyLabel}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 z-50 w-max max-w-[15rem] px-2.5 py-1.5 rounded-md border border-border bg-popover text-popover-foreground text-[11px] leading-snug text-center shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-150"
      >
        {transition.tooltip}
        <span
          aria-hidden
          className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-popover"
        />
      </span>
    </span>
  );
}

export function CamelotBadge({
  label,
  transition,
}: {
  label: string;
  transition?: TransitionAnalysis | null;
}) {
  const style = transition ? getKeyCompatStyle(transition.keyCompat.type) : null;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-full border text-[11px] font-bold font-mono",
        !style && "border-border bg-white/5 text-foreground"
      )}
      style={
        style
          ? {
              color: style.color,
              backgroundColor: style.bg,
              borderColor: style.border,
            }
          : undefined
      }
      title={transition?.keyCompat.description}
    >
      {label}
    </span>
  );
}
