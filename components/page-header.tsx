import type { ReactNode } from "react";
import { GradientFlowIcon } from "@/components/gradient-flow-icon";
import type { GradientFlowIconName } from "@/lib/gradient-flow-masks";
import {
  COHESIVE_PANEL_CLASS,
  COHESIVE_TITLE_SHADOW,
  COHESIVE_SURFACE_STYLE,
} from "@/lib/ui-surfaces";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon: GradientFlowIconName;
  title: string;
  description: string;
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
    <header className={cn("flex items-start gap-4", className)}>
      <div
        className={cn(
          "flex size-14 flex-shrink-0 items-center justify-center rounded-2xl border border-[#a855f7]/60",
          COHESIVE_PANEL_CLASS
        )}
        style={{
          ...COHESIVE_SURFACE_STYLE,
          ...COHESIVE_TITLE_SHADOW,
        }}
      >
        <GradientFlowIcon name={icon} className="size-7" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="gradient-flow-text truncate text-3xl font-bold tracking-tight md:text-4xl">
            {title}
          </h1>
          {titleExtra}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </header>
  );
}
