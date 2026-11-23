import { lazy as lazyComponent, Suspense, type ComponentProps, type ComponentType } from "react";

import type { HourBars as HourBarsChart } from "@/kit/charts/hour-bars";
import type { PillBars as PillBarsChart } from "@/kit/charts/pill-bars";
import { cn } from "@/lib/utils";

function lazy<P extends { className?: string }>(load: () => Promise<ComponentType<P>>) {
  const Chart = lazyComponent(() => load().then((component) => ({ default: component })));
  function LazyChart({ className, ...props }: P) {
    return (
      <div className={cn("min-w-0", className)}>
        <Suspense>
          <Chart {...(props as unknown as P)} className="size-full" />
        </Suspense>
      </div>
    );
  }
  return LazyChart;
}

export const PillBars = lazy<ComponentProps<typeof PillBarsChart>>(() =>
  import("@/kit/charts/pill-bars").then((module) => module.PillBars),
);
export const HourBars = lazy<ComponentProps<typeof HourBarsChart>>(() =>
  import("@/kit/charts/hour-bars").then((module) => module.HourBars),
);
