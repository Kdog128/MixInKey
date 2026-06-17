import { cn } from "@/lib/utils";
import {
  GRADIENT_FLOW_ICON_MASKS,
  type GradientFlowIconName,
} from "@/lib/gradient-flow-masks";

interface GradientFlowIconProps {
  name: GradientFlowIconName;
  className?: string;
}

/** Icon mask filled with the same gradient-text-flow animation as gradient-flow-text. */
export function GradientFlowIcon({ name, className }: GradientFlowIconProps) {
  const mask = GRADIENT_FLOW_ICON_MASKS[name];

  return (
    <span
      aria-hidden="true"
      className={cn("gradient-flow-icon inline-block size-5 shrink-0", className)}
      style={{
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
}
