import { GradientFlowIcon } from "@/components/gradient-flow-icon";
import { cn } from "@/lib/utils";

interface MixInKeyLogoProps {
  className?: string;
  /** Show Headphones icon beside the wordmark (sidebar). */
  showIcon?: boolean;
  /** Hide wordmark — icon only (mobile sidebar). */
  iconOnly?: boolean;
  /** Render as a heading element. */
  as?: "span" | "h1";
  size?: "sm" | "md" | "lg";
  /** Extra classes for the wordmark text (e.g. sidebar reveal). */
  wordmarkClassName?: string;
  /** Extra classes for the logo icon (size, layout). */
  iconClassName?: string;
}

const sizeClasses = {
  sm: "text-base md:text-lg",
  md: "text-lg md:text-xl",
  lg: "text-xl md:text-2xl",
} as const;

export function MixInKeyLogo({
  className,
  showIcon = false,
  iconOnly = false,
  as: Tag = "span",
  size = "sm",
  wordmarkClassName,
  iconClassName,
}: MixInKeyLogoProps) {
  return (
    <Tag className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      {showIcon && <GradientFlowIcon name="headphones" className={iconClassName} />}
      {!iconOnly && (
        <span
          className={cn(
            "truncate font-bold tracking-tight group-hover/sidebar:truncate-none",
            wordmarkClassName ?? "gradient-flow-text",
            sizeClasses[size]
          )}
        >
          MixInKey
        </span>
      )}
    </Tag>
  );
}
