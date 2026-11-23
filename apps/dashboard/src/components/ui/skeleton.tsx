import { cn } from "cn";

function Skeleton({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="skeleton"
      className={cn("block animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
