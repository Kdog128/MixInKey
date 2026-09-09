import type { GradientFlowIconName } from "@/lib/gradient-flow-masks";
import { dispatchCompatibilityNavReset } from "@/lib/compatibility-nav-reset";
import { normalizePathname } from "@/lib/nav-active";

export const NAV_ITEMS = [
  {
    href: "/",
    label: "Compatibility",
    mobileLabel: "Mix",
    icon: "disc-3" as GradientFlowIconName,
    match: (path: string) => path === "/",
  },
  {
    href: "/setlist",
    label: "Set Planner",
    mobileLabel: "Set",
    icon: "list-music" as GradientFlowIconName,
    match: (path: string) => path.startsWith("/setlist"),
  },
  {
    href: "/favorites",
    label: "Favorites",
    mobileLabel: "Favs",
    icon: "heart" as GradientFlowIconName,
    match: (path: string) => path.startsWith("/favorites"),
  },
  {
    href: "/recommendations",
    label: "Recommendations",
    mobileLabel: "Recs",
    icon: "sparkles" as GradientFlowIconName,
    match: (path: string) => path.startsWith("/recommendations"),
  },
  {
    href: "/history",
    label: "History",
    mobileLabel: "History",
    icon: "clock" as GradientFlowIconName,
    match: (path: string) => path.startsWith("/history"),
  },
] as const;

export function getActiveNavHref(pathname: string): string | null {
  const path = normalizePathname(pathname);
  let best: (typeof NAV_ITEMS)[number] | null = null;

  for (const item of NAV_ITEMS) {
    if (!item.match(path)) continue;
    if (!best || item.href.length > best.href.length) {
      best = item;
    }
  }

  return best?.href ?? null;
}

export function handleNavClick(href: string, pathname: string) {
  if (href === "/" && normalizePathname(pathname) === "/") {
    dispatchCompatibilityNavReset();
  }
}
