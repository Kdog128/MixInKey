export const COMPATIBILITY_NAV_RESET_EVENT = "compatibility-nav-reset";

export function dispatchCompatibilityNavReset() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COMPATIBILITY_NAV_RESET_EVENT));
}
