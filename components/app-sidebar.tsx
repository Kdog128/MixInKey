"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MixInKeyLogo } from "@/components/mixinkey-logo";
import { GradientFlowIcon } from "@/components/gradient-flow-icon";
import type { GradientFlowIconName } from "@/lib/gradient-flow-masks";
import { dispatchCompatibilityNavReset } from "@/lib/compatibility-nav-reset";
import { normalizePathname, resolveNavPathname } from "@/lib/nav-active";
import { COHESIVE_PANEL_CLASS } from "@/lib/ui-surfaces";
import { cn } from "@/lib/utils";

/** Shared icon bubble — active nav items use the same purple ring + glow as page headers. */
const NAV_ICON_WRAPPER_CLASS =
  "flex size-9 shrink-0 items-center justify-center rounded-xl border transition-all duration-300 ease-in-out";

const NAV_ICON_ACTIVE_CLASS = cn(
  "border-[#a855f7]/60 nav-icon-active-surface",
  COHESIVE_PANEL_CLASS
);

const NAV_ICON_INACTIVE_CLASS =
  "border-transparent bg-transparent group-hover/sidebar:group-hover/nav:border-[#a855f7]/20 group-hover/sidebar:group-hover/nav:bg-[#a855f7]/10";

const navItems = [
  {
    href: "/",
    label: "Compatibility",
    icon: "disc-3" as GradientFlowIconName,
    match: (path: string) => path === "/",
  },
  {
    href: "/setlist",
    label: "Set Planner",
    icon: "list-music" as GradientFlowIconName,
    match: (path: string) => path.startsWith("/setlist"),
  },
  {
    href: "/favorites",
    label: "Favorites",
    icon: "heart" as GradientFlowIconName,
    match: (path: string) => path.startsWith("/favorites"),
  },
  {
    href: "/recommendations",
    label: "Recommendations",
    icon: "sparkles" as GradientFlowIconName,
    match: (path: string) => path.startsWith("/recommendations"),
  },
  {
    href: "/history",
    label: "History",
    icon: "clock" as GradientFlowIconName,
    match: (path: string) => path.startsWith("/history"),
  },
] as const;

const labelRevealClass =
  "max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-300 ease-in-out group-hover/sidebar:max-w-full group-hover/sidebar:flex-1 group-hover/sidebar:overflow-visible group-hover/sidebar:opacity-100";

const logoWordmarkRevealClass =
  "max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-300 ease-in-out group-hover/sidebar:max-w-[5.75rem] group-hover/sidebar:overflow-visible group-hover/sidebar:opacity-100";

function getActiveNavHref(pathname: string): string | null {
  const path = normalizePathname(pathname);
  let best: (typeof navItems)[number] | null = null;

  for (const item of navItems) {
    if (!item.match(path)) continue;
    if (!best || item.href.length > best.href.length) {
      best = item;
    }
  }

  return best?.href ?? null;
}

function handleNavClick(href: string, pathname: string) {
  if (href === "/" && normalizePathname(pathname) === "/") {
    dispatchCompatibilityNavReset();
  }
}

interface AppSidebarProps {
  initialPathname: string;
}

export function AppSidebar({ initialPathname }: AppSidebarProps) {
  const clientPathname = usePathname();
  const pathname = resolveNavPathname(clientPathname, initialPathname);
  const activeHref = getActiveNavHref(pathname);

  return (
    <aside
      className={cn(
        "app-sidebar group/sidebar fixed left-0 top-0 z-30 flex h-screen w-16 flex-col overflow-hidden",
        "border-r border-transparent bg-transparent",
        "transition-[width,background-color,border-color,box-shadow] duration-300 ease-in-out",
        "hover:w-60 hover:border-sidebar-border hover:bg-sidebar hover:shadow-[4px_0_24px_rgba(0,0,0,0.35)]"
      )}
      aria-label="Main navigation"
    >
      <div
        className="pointer-events-none absolute left-full top-0 z-40 h-full w-10 bg-gradient-to-r from-black/40 to-transparent"
        aria-hidden="true"
      />
      <div className="flex h-full flex-col items-center gap-1 p-3 group-hover/sidebar:items-stretch group-hover/sidebar:p-4">
        <Link
          href="/"
          aria-label="MixInKey home"
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl border border-transparent p-2.5 transition-all duration-300 ease-in-out",
            "group-hover/sidebar:justify-start group-hover/sidebar:px-3",
            "group-hover/sidebar:hover:border-[rgba(168,85,247,0.3)] group-hover/sidebar:hover:bg-[rgba(168,85,247,0.1)]",
            "group-hover/sidebar:hover:shadow-[0_0_24px_rgba(168,85,247,0.15)]"
          )}
        >
          <MixInKeyLogo
            showIcon
            className="shrink-0"
            wordmarkClassName={cn(
              "text-[#c084fc] group-hover/sidebar:overflow-visible",
              logoWordmarkRevealClass
            )}
          />
        </Link>

        <nav className="mt-6 flex w-full flex-1 flex-col gap-1 overflow-y-auto overflow-x-clip group-hover/sidebar:overflow-x-visible">
          {navItems.map(({ href, label, icon }) => {
            const active = activeHref === href;

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                title={label}
                onClick={() => handleNavClick(href, pathname)}
                className={cn(
                  "group/nav flex w-full items-center rounded-lg border border-transparent bg-transparent px-2.5 py-2.5 transition-colors duration-300 ease-in-out",
                  "justify-center gap-0 group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3",
                  !active &&
                    "group-hover/sidebar:group-hover/nav:bg-[#a855f7]/10"
                )}
              >
                <span
                  className={cn(
                    NAV_ICON_WRAPPER_CLASS,
                    active ? NAV_ICON_ACTIVE_CLASS : NAV_ICON_INACTIVE_CLASS
                  )}
                >
                  <GradientFlowIcon name={icon} />
                </span>
                <span
                  className={cn(
                    "min-w-0 text-sm font-medium leading-none",
                    labelRevealClass,
                    active ? "text-[#c084fc]" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
