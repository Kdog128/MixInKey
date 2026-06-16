import { Disc3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MixInKeyLogoProps {
  className?: string;
  /** Show Disc3 icon beside the wordmark (sidebar). */
  showIcon?: boolean;
  /** Hide wordmark — icon only (mobile sidebar). */
  iconOnly?: boolean;
  /** Render as a heading element. */
  as?: "span" | "h1";
  size?: "sm" | "md" | "lg";
  /** Extra classes for the wordmark text (e.g. sidebar reveal). */
  wordmarkClassName?: string;
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
}: MixInKeyLogoProps) {
  return (
    <Tag className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      {showIcon && (
        <Disc3 className="size-5 shrink-0" style={{ color: "#a855f7" }} aria-hidden="true" />
      )}
      {!iconOnly && (
        <span
          className={cn(
            "truncate font-bold tracking-tight text-[#a855f7]",
            sizeClasses[size],
            wordmarkClassName
          )}
        >
          MixInKey
        </span>
      )}
    </Tag>
  );
}
