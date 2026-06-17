"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MixInKeyLogo } from "@/components/mixinkey-logo";
import { GradientFlowIcon } from "@/components/gradient-flow-icon";
import type { GradientFlowIconName } from "@/lib/gradient-flow-masks";
import { cn } from "@/lib/utils";

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

function normalizePathname(pathname: string): string {
  const path = pathname.split("?")[0].split("#")[0];
  if (path !== "/" && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

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

export function AppSidebar() {
  const pathname = usePathname();
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
              "gradient-flow-text group-hover/sidebar:overflow-visible",
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
                className={cn(
                  "flex w-full items-center rounded-lg border px-2.5 py-2.5 transition-colors duration-300 ease-in-out",
                  "justify-center gap-0 group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3",
                  active
                    ? "border-[#a855f7]/35 bg-[#a855f7]/15"
                    : "border-transparent bg-transparent group-hover/sidebar:hover:border-[#a855f7]/20 group-hover/sidebar:hover:bg-[#a855f7]/10"
                )}
              >
                <GradientFlowIcon name={icon} />
                <span
                  className={cn(
                    "gradient-flow-text min-w-0 text-sm font-medium leading-none",
                    labelRevealClass
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
