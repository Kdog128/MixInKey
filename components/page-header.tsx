import type { ReactNode } from "react";
import { GradientFlowIcon } from "@/components/gradient-flow-icon";
import type { GradientFlowIconName } from "@/lib/gradient-flow-masks";
import {
  COHESIVE_PANEL_CLASS,
  COHESIVE_TITLE_SHADOW,
  COHESIVE_SURFACE_STYLE,
} from "@/lib/ui-surfaces";
import { cn } from "@/lib/utils";

/** Matches Compatibility page title pill — icon and title in one bordered/glowing container. */
const PAGE_TITLE_PILL_CLASS =
  "inline-flex w-fit min-w-0 max-w-full items-center rounded-2xl border border-[#a855f7]/60 px-4 py-2.5";

interface PageHeaderProps {
  icon: GradientFlowIconName;
  title: string;
  description?: string;
  titleExtra?: ReactNode;
  className?: string;
}

export function PageHeader({
  icon,
  title,
  description,
  titleExtra,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col items-start gap-1", className)}>
      <div className="flex min-w-0 max-w-full items-center gap-2">
        <div
          className={cn(PAGE_TITLE_PILL_CLASS, COHESIVE_PANEL_CLASS)}
          style={{
            ...COHESIVE_SURFACE_STYLE,
            ...COHESIVE_TITLE_SHADOW,
          }}
        >
          <div className="-ml-0.5 flex size-10 flex-shrink-0 items-center justify-center">
            <GradientFlowIcon name={icon} className="size-6" />
          </div>
          <h1 className="gradient-flow-text ml-0.5 truncate text-xl font-bold tracking-tight md:text-2xl">
            {title}
          </h1>
        </div>
        {titleExtra}
      </div>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
    </header>
  );
}
