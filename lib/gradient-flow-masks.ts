/** Shared gradient animation — all targets use `gradient-text-flow` in globals.css. */
export const GRADIENT_FLOW_DURATION = "5s";
export const GRADIENT_FLOW_DELAY = "0s";
export const GRADIENT_FLOW_EASING = "linear";
export const GRADIENT_FLOW_ANIMATION_MS = 5000;

function lucideIconMaskUrl(markup: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export type GradientFlowIconName =
  | "headphones"
  | "disc-3"
  | "list-music"
  | "heart"
  | "sparkles"
  | "clock";

export const GRADIENT_FLOW_ICON_MASKS: Record<GradientFlowIconName, string> = {
  headphones: lucideIconMaskUrl(
    '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>'
  ),
  "disc-3": lucideIconMaskUrl(
    '<circle cx="12" cy="12" r="10"/><path d="M6 12c0-1.7.7-3.2 1.8-4.2"/><circle cx="12" cy="12" r="2"/><path d="M18 12c0 1.7-.7 3.2-1.8 4.2"/>'
  ),
  "list-music": lucideIconMaskUrl(
    '<path d="M16 5H3"/><path d="M11 12H3"/><path d="M11 19H3"/><path d="M21 16V5"/><circle cx="18" cy="16" r="3"/>'
  ),
  heart: lucideIconMaskUrl(
    '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>'
  ),
  sparkles: lucideIconMaskUrl(
    '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>'
  ),
  clock: lucideIconMaskUrl(
    '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'
  ),
};
