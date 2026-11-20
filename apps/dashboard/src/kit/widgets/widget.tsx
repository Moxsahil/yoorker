import { ArrowDownIcon, ArrowUpIcon, MoreVerticalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { formatPercent } from "../data/format";

/**
 * The dashboard widget frame: a soft, borderless card. Every widget in the
 * kit (small, horizontal, XL) is built from this and the parts below, so they
 * share spacing, type and the monospace number style.
 */
export function Widget({ className, children }: { className?: string; children: React.ReactNode }) {
  // Fades in on mount (@starting-style), so a widget replacing its skeleton arrives rather than flashes.
  return (
    <Card
      className={cn(
        "gap-4 rounded-2xl shadow-(--surface-shadow) ring-foreground/5 transition-opacity duration-250 ease-smooth-out starting:opacity-0 [--card-spacing:--spacing(5)]",
        className,
      )}
    >
      {children}
    </Card>
  );
}

export function WidgetHeader({
  title,
  icon: Icon,
  action,
  menu,
  className,
}: {
  title: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** A link or control on the right, such as "View all". */
  action?: React.ReactNode;
  /** DropdownMenuItems for the ⋮ menu. */
  menu?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-2 px-(--card-spacing)", className)}>
      <div className="flex items-center gap-2 text-base font-medium">
        {Icon && <Icon className="size-4 text-primary" />}
        {title}
      </div>
      {action && <div className="-my-1 -me-2 flex items-center">{action}</div>}
      {menu && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="-me-2 -mt-1 text-muted-foreground"
                aria-label="Widget options"
              />
            }
          >
            <MoreVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuGroup>{menu}</DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/** ↑ 2.5% in green or ↓ 1.2% in red. `invert` for metrics where down is good. */
export function Delta({
  value,
  invert = false,
  className,
}: {
  value: number | null | undefined;
  invert?: boolean;
  className?: string;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const up = value >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpIcon : ArrowDownIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-sm font-medium tabular-nums",
        good ? "text-success" : "text-destructive",
        className,
      )}
    >
      <Icon className="size-3.5" />
      {formatPercent(Math.abs(value))}
    </span>
  );
}

/** The big monospace figure with its change and a quiet caption. */
export function WidgetValue({
  value,
  delta,
  invert,
  caption,
  size = "lg",
  className,
}: {
  value: React.ReactNode;
  delta?: number | null;
  invert?: boolean;
  caption?: React.ReactNode;
  size?: "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = { md: "text-2xl", lg: "text-3xl", xl: "text-4xl sm:text-5xl" };
  return (
    <div className={cn("flex flex-col gap-1 px-(--card-spacing)", className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* Keyed by the figure, so a new value (another date range, say) rises in instead of swapping silently. */}
        <span
          key={typeof value === "string" || typeof value === "number" ? value : undefined}
          className={cn(
            "animate-rise font-mono font-semibold tracking-tight tabular-nums",
            sizes[size],
          )}
        >
          {value}
        </span>
        {size === "xl" && <Delta value={delta} invert={invert} />}
      </div>
      {(size !== "xl" || caption) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {size !== "xl" && <Delta value={delta} invert={invert} />}
          {caption && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{caption}</span>
          )}
        </div>
      )}
    </div>
  );
}
