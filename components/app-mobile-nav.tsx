"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GradientFlowIcon } from "@/components/gradient-flow-icon";
import {
  getActiveNavHref,
  handleNavClick,
  NAV_ITEMS,
} from "@/lib/nav-items";
import { resolveNavPathname } from "@/lib/nav-active";
import { getVisitorClientId } from "@/lib/visitor-id";
import { COHESIVE_PANEL_CLASS } from "@/lib/ui-surfaces";
import { cn } from "@/lib/utils";

const NAV_ICON_WRAPPER_CLASS =
  "flex size-8 shrink-0 items-center justify-center rounded-xl border transition-all duration-300 ease-in-out";

const NAV_ICON_ACTIVE_CLASS = cn(
  "border-[#a855f7]/60 nav-icon-active-surface",
  COHESIVE_PANEL_CLASS
);

const NAV_ICON_INACTIVE_CLASS = "border-transparent bg-transparent";

interface AppMobileNavProps {
  initialPathname: string;
}

export function AppMobileNav({ initialPathname }: AppMobileNavProps) {
  const clientPathname = usePathname();
  const pathname = resolveNavPathname(clientPathname, initialPathname);
  const activeHref = getActiveNavHref(pathname);

  useEffect(() => {
    getVisitorClientId();
  }, []);

  return (
    <nav
      className="app-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar/95 backdrop-blur-md md:hidden"
      aria-label="Main navigation"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid h-[4.25rem] grid-cols-5">
        {NAV_ITEMS.map(({ href, label, mobileLabel, icon }) => {
          const active = activeHref === href;

          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                title={label}
                onClick={() => handleNavClick(href, pathname)}
                className="flex h-full min-w-0 flex-col items-center justify-center gap-0.5 px-1"
              >
                <span
                  className={cn(
                    NAV_ICON_WRAPPER_CLASS,
                    active ? NAV_ICON_ACTIVE_CLASS : NAV_ICON_INACTIVE_CLASS
                  )}
                >
                  <GradientFlowIcon name={icon} className="size-4" />
                </span>
                <span
                  className={cn(
                    "w-full truncate text-center text-[10px] font-medium leading-tight",
                    active ? "text-[#c084fc]" : "text-muted-foreground"
                  )}
                >
                  {mobileLabel}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
