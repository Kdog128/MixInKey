"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitCompare, ListMusic, Heart, Sparkles, Clock } from "lucide-react";
import { MixInKeyLogo } from "@/components/mixinkey-logo";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Compatibility", icon: GitCompare, match: (path: string) => path === "/" },
  {
    href: "/setlist",
    label: "Set Planner",
    icon: ListMusic,
    match: (path: string) => path.startsWith("/setlist"),
  },
  {
    href: "/favorites",
    label: "Favorites",
    icon: Heart,
    match: (path: string) => path.startsWith("/favorites"),
  },
  {
    href: "/recommendations",
    label: "Recommendations",
    icon: Sparkles,
    match: (path: string) => path.startsWith("/recommendations"),
  },
  {
    href: "/history",
    label: "History",
    icon: Clock,
    match: (path: string) => path.startsWith("/history"),
  },
] as const;

const labelRevealClass =
  "max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,margin] duration-300 ease-in-out group-hover/sidebar:ml-0 group-hover/sidebar:max-w-[11rem] group-hover/sidebar:opacity-100";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "group/sidebar fixed left-0 top-0 z-30 flex h-screen w-16 flex-col overflow-hidden",
        "border-r border-transparent bg-transparent",
        "transition-[width,background-color,border-color,box-shadow] duration-300 ease-in-out",
        "hover:w-52 hover:border-sidebar-border hover:bg-sidebar hover:shadow-[4px_0_24px_rgba(0,0,0,0.35)]"
      )}
      aria-label="Main navigation"
    >
      <div className="flex h-full flex-col items-center gap-1 p-3 group-hover/sidebar:items-stretch group-hover/sidebar:p-4">
        <Link
          href="/"
          aria-label="MixInKey home"
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl p-2.5 transition-all duration-300 ease-in-out",
            "group-hover/sidebar:justify-start group-hover/sidebar:border group-hover/sidebar:px-3",
            "group-hover/sidebar:border-[rgba(168,85,247,0.3)] group-hover/sidebar:bg-[rgba(168,85,247,0.1)]",
            "group-hover/sidebar:shadow-[0_0_24px_rgba(168,85,247,0.15)]"
          )}
        >
          <MixInKeyLogo
            showIcon
            className="shrink-0"
            wordmarkClassName={cn("text-base text-white", labelRevealClass)}
          />
        </Link>

        <nav className="mt-6 flex w-full flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden">
          {navItems.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                title={label}
                className={cn(
                  "flex w-full items-center rounded-lg px-2.5 py-2.5 transition-colors duration-300 ease-in-out",
                  "justify-center gap-0 border border-transparent group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3",
                  active
                    ? "text-[#c084fc] group-hover/sidebar:border-[#a855f7]/35 group-hover/sidebar:bg-[#a855f7]/15"
                    : "text-muted-foreground hover:text-[#c084fc] group-hover/sidebar:hover:border-[#a855f7]/20 group-hover/sidebar:hover:bg-[#a855f7]/10"
                )}
              >
                <Icon className="size-5 shrink-0" />
                <span className={cn("text-sm font-medium", labelRevealClass)}>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
