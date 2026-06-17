import { cn } from "@/lib/utils";

/** Purple-tinted dark surface — app-wide panels, cards, and fields. */
export const COHESIVE_SURFACE_STYLE = {
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  backgroundImage:
    "linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(59,130,246,0.08) 50%, rgba(168,85,247,0.12) 100%)",
} as const;

/** @deprecated Use COHESIVE_SURFACE_STYLE — kept for Compatibility page imports. */
export const MAIN_PAGE_SURFACE_STYLE = COHESIVE_SURFACE_STYLE;

export const MAIN_PAGE_FIELD_SURFACE_STYLE = COHESIVE_SURFACE_STYLE;

export const COHESIVE_FIELD_SURFACE_STYLE = COHESIVE_SURFACE_STYLE;

/** Neutral grey/black surface for nested fields and labels (no purple tint). */
export const NEUTRAL_SURFACE_STYLE = {
  backgroundColor: "rgba(9, 9, 11, 0.8)",
} as const;

export const NEUTRAL_FIELD_SURFACE_CLASS = "bg-zinc-950/80";

/** Backdrop only — pair with COHESIVE_SURFACE_STYLE inline. */
export const COHESIVE_SURFACE_CLASS = "backdrop-blur-sm";

export const COHESIVE_FIELD_SURFACE_CLASS = "bg-transparent";

/** Panels over animated backgrounds (mosaic, etc.). */
export const COHESIVE_PANEL_CLASS = COHESIVE_SURFACE_CLASS;

/** Standard page card / section container. */
export const COHESIVE_CARD_CLASS = cn(
  "rounded-2xl border border-border backdrop-blur-sm"
);

/** App page layout — content column below sidebar. */
export const PAGE_CONTENT_CLASS =
  "relative z-10 mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-8 px-4 py-12";

/** Primary section card padding (Set Planner, Favorites, etc.). */
export const PAGE_SECTION_CARD_CLASS = cn(COHESIVE_CARD_CLASS, "p-5 md:p-6");

/** Nested card, stat box, or list row container. */
export const COHESIVE_INNER_CARD_CLASS = cn(
  "rounded-xl border border-border"
);

/** Small control / input surface (buttons, fields). */
export const COHESIVE_CONTROL_SURFACE_CLASS = cn(
  "rounded-lg border border-border"
);

export const COHESIVE_CARD_SHADOW = {
  boxShadow: "0 0 40px rgba(0,0,0,0.5)",
} as const;

export const COHESIVE_TITLE_SHADOW = {
  boxShadow: "0 0 28px rgba(168,85,247,0.35)",
} as const;

export const COHESIVE_ENERGY_SHADOW = {
  boxShadow: "0 0 60px rgba(168,85,247,0.1)",
} as const;

/** Purple-tinted background fill without shadow. */
export function cohesiveSurfaceStyle(): typeof COHESIVE_SURFACE_STYLE {
  return COHESIVE_SURFACE_STYLE;
}

/** Background fill + shadow for card containers. */
export function cohesiveCardStyle(
  shadow: Record<string, string> = COHESIVE_CARD_SHADOW
): typeof COHESIVE_SURFACE_STYLE & Record<string, string> {
  return { ...COHESIVE_SURFACE_STYLE, ...shadow };
}
