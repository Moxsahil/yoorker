import { CheckIcon, CopyIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function SwapIcon({
  swapped,
  from: From = CopyIcon,
  to: To = CheckIcon,
  className,
}: {
  swapped: boolean;
  from?: React.ComponentType<{ className?: string }>;
  to?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  const layer =
    "col-start-1 row-start-1 transition-[opacity,scale,filter] duration-150 ease-smooth-out";
  return (
    <span className={cn("grid place-items-center *:size-[inherit]", className)} aria-hidden>
      <From
        className={cn(layer, swapped ? "scale-50 opacity-0 blur-[2px]" : "scale-100 opacity-100")}
      />
      <To
        className={cn(layer, swapped ? "scale-100 opacity-100" : "scale-50 opacity-0 blur-[2px]")}
      />
    </span>
  );
}

export function useCopied(timeout = 1500) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), timeout);
    return () => clearTimeout(timer);
  }, [copied, timeout]);
  const copy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }, []);
  return { copied, copy };
}
