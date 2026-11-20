import { Building2Icon, SparklesIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { Link } from "@/kit/framework";
import { EmptyState } from "@/kit/ui-patterns/query-state";
import { ApiError } from "@/lib/api";
import { loadDemoVenue } from "@/lib/seed";
import { useCurrentVenue, useRefreshAll, useVenueChoice } from "@/lib/session";
import { DEV_NOTES } from "@/lib/dev-notes";

/** Marks a widget whose numbers are sample data until its sprint ships. */
export function SampleBadge({ sprint }: { sprint?: string }) {
  if (!DEV_NOTES) return null;
  return (
    <Badge
      variant="outline"
      className="font-normal text-muted-foreground"
      title={sprint ? `Real data arrives in ${sprint}` : undefined}
    >
      Sample data
    </Badge>
  );
}

/** Marks a widget fed by the real Yoorker API. */
export function LiveBadge() {
  if (!DEV_NOTES) return null;
  return (
    <Badge
      variant="outline"
      className="gap-1 border-emerald-500/30 font-normal text-emerald-600 dark:text-emerald-400"
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      Live API
    </Badge>
  );
}

export function LoadDemoVenueButton({
  label = "Load demo venue (Green Arena)",
  variant = "default",
}: {
  label?: string;
  variant?: "default" | "outline";
}) {
  const { organisations } = useCurrentVenue();
  const choose = useVenueChoice((state) => state.choose);
  const refresh = useRefreshAll();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const venue = await loadDemoVenue(organisations.find((o) => o.role !== "STAFF")?.id);
          choose(venue.id);
          await refresh();
          toast.add({
            type: "success",
            title: "Green Arena is ready",
            description: "3 courts with hours, prices and a block tomorrow morning.",
          });
        } catch (error) {
          toast.add({
            type: "error",
            title: "Couldn't create the venue",
            description: error instanceof ApiError ? error.message : String(error),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner /> : <SparklesIcon data-icon="inline-start" />}
      {label}
    </Button>
  );
}

export function NoVenue() {
  return (
    <EmptyState
      icon={Building2Icon}
      title="Set up your first venue"
      description={
        DEV_NOTES
          ? "Create Green Arena with three courts, real opening hours, booking lengths, prices and a block, all through the Yoorker API."
          : "Add the place players come to, then its courts, hours and prices."
      }
      action={
        DEV_NOTES ? (
          <LoadDemoVenueButton />
        ) : (
          <Link href="/venues/new" className={buttonVariants()}>
            Add venue
          </Link>
        )
      }
      className="rounded-xl border bg-card py-16"
    />
  );
}
