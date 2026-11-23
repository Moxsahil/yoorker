import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

/** The mark and the name, set in the UI font, from config/brand.ts. */
export function BrandLogo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  const Mark = BRAND.mark;
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <Mark className={cn("size-6", markClassName)} />
      {BRAND.name}
    </span>
  );
}
