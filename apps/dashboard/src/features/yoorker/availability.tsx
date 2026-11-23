import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRangeIcon, IndianRupeeIcon, SmartphoneIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { useRouter, useSearchParams } from "@/kit/framework";
import { Badge } from "@/components/ui/badge";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { PageHeader } from "@/kit/ui-patterns/page-header";
import { Segmented } from "@/kit/ui-patterns/segmented";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import { api, ApiError } from "@/lib/api";
import { demoBookings } from "@/lib/demo-data";
import { useManualBookings } from "@/lib/manual-bookings";
import { useCurrentVenue } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  dayLabel,
  inr,
  lengthLabel,
  REASON_LABEL,
  SPORT_LABEL,
  todayAt,
  type BlockReason,
  type CourtGrid,
  type CourtPrices,
  type CourtSchedule,
  type CourtSlots,
  type GridCell,
} from "@/lib/yoorker";
import { DEV_NOTES } from "@/lib/dev-notes";

import { LiveBadge, NoVenue } from "./common";
import { PricesCard } from "./prices-editor";
import { ScheduleCard } from "./schedule-editor";
import { AvailabilitySkeleton } from "./page-skeletons";

function localDateTime(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${date}T${time}`;
}

const CELL: Record<GridCell["status"], string> = {
  FREE: "bg-success/12 text-success hover:bg-success/25",
  HELD: "bg-warning/25 text-warning",
  BOOKED: "bg-info/20 text-info",
  BLOCKED:
    "bg-destructive/15 text-destructive hover:bg-destructive/25 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_oklch,var(--destructive)_18%,transparent)_6px_12px)]",
  PAST: "bg-muted/60 text-muted-foreground",
};

const LEGEND: { label: string; swatch: string }[] = [
  { label: "Free", swatch: "bg-success" },
  { label: "Booked", swatch: "bg-info" },
  { label: "Blocked", swatch: "bg-destructive" },
  { label: "Past", swatch: "bg-muted-foreground/40" },
];

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function WeekGrid({
  courtId,
  venueId,
  timezone,
  courtName,
  courtNames,
}: {
  courtId: string;
  venueId: string;
  timezone: string;
  courtName: string;
  courtNames: string[];
}) {
  const client = useQueryClient();
  const today = todayAt(timezone);
  const manual = useManualBookings((state) => state.bookings);
  const booked = useMemo(
    () =>
      [...demoBookings(today, courtNames), ...manual].filter(
        (b) => b.court === courtName && b.booking !== "CANCELLED",
      ),
    [today, courtNames, courtName, manual],
  );
  const bookingAt = (date: string, start: string) => {
    const at = minutesOf(start);
    return booked.find(
      (b) => b.date === date && minutesOf(b.start) <= at && at < minutesOf(b.start) + b.minutes,
    );
  };
  const [reason, setReason] = useState<BlockReason>("MAINTENANCE");
  const grid = useQuery({
    queryKey: ["grid", courtId, today, 7],
    queryFn: () => api<CourtGrid>(`/courts/${courtId}/grid?from=${today}&days=7`),
  });

  const rows = useMemo(() => {
    if (!grid.data) return [];
    const byOffset = new Map<number, string>();
    for (const day of grid.data.days) {
      const midnight = Date.parse(`${day.date}T00:00:00+05:30`);
      for (const cell of day.cells)
        byOffset.set(Math.round((Date.parse(cell.startsAt) - midnight) / 60000), cell.start);
    }
    return [...byOffset.entries()].sort((a, b) => a[0] - b[0]);
  }, [grid.data]);

  const click = async (cell: GridCell) => {
    try {
      if (cell.status === "FREE") {
        await api(`/venues/${venueId}/blocks`, {
          body: {
            from: localDateTime(cell.startsAt, timezone),
            to: localDateTime(cell.endsAt, timezone),
            reason,
            courtIds: [courtId],
          },
        });
        toast.add({
          type: "success",
          title: `Blocked ${cell.start}`,
          description: `${REASON_LABEL[reason]} · saved through the API`,
        });
      } else if (cell.status === "BLOCKED" && cell.blockId) {
        await api(`/blocks/${cell.blockId}`, { method: "DELETE" });
        toast.add({
          type: "success",
          title: "Block removed",
          description: "The whole block was removed, so the court is free again.",
        });
      } else return;
      await client.invalidateQueries({ queryKey: ["grid", courtId] });
      await client.invalidateQueries({ queryKey: ["slots", courtId] });
    } catch (error) {
      toast.add({
        type: "error",
        title: "Couldn't change the grid",
        description: error instanceof ApiError ? error.message : String(error),
      });
    }
  };

  return (
    <Widget className="gap-0">
      <WidgetHeader
        title="Week grid"
        icon={CalendarRangeIcon}
        action={
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            Tap a free cell to block it as
            <NativeSelect
              size="sm"
              value={reason}
              onChange={(e) => setReason(e.target.value as BlockReason)}
            >
              {(Object.keys(REASON_LABEL) as BlockReason[]).map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {REASON_LABEL[r]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </span>
        }
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-(--card-spacing) pt-3 pb-1 text-xs text-muted-foreground">
        {LEGEND.map(({ label, swatch }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", swatch)} />
            {label}
          </span>
        ))}
        {DEV_NOTES && <span>· Bookings are sample data until Sprint 3</span>}
      </div>
      {!grid.data ? (
        <Skeleton className="m-(--card-spacing) h-96" />
      ) : rows.length === 0 ? (
        <p className="px-(--card-spacing) pb-(--card-spacing) text-sm text-muted-foreground">
          No opening hours this week. Set them below.
        </p>
      ) : (
        <div className="max-h-[34rem] overflow-auto px-(--card-spacing) pb-(--card-spacing)">
          <table className="w-full border-separate border-spacing-1 text-xs">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                <th className="w-14" />
                {grid.data.days.map((day) => (
                  <th
                    key={day.date}
                    className={cn(
                      "py-1.5 font-medium",
                      day.date === today ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {dayLabel(day.date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([offset, label]) => (
                <tr key={offset}>
                  <td className="pe-1 text-end font-mono text-muted-foreground tabular-nums">
                    {label}
                  </td>
                  {grid.data!.days.map((day) => {
                    const midnight = Date.parse(`${day.date}T00:00:00+05:30`);
                    const cell = day.cells.find(
                      (c) => Math.round((Date.parse(c.startsAt) - midnight) / 60000) === offset,
                    );
                    if (!cell) return <td key={day.date} className="rounded-md bg-muted/20" />;
                    const end = localDateTime(cell.endsAt, timezone).slice(11);
                    const booking =
                      cell.status === "FREE" || cell.status === "PAST"
                        ? bookingAt(day.date, cell.start)
                        : undefined;
                    const status = booking ? "BOOKED" : cell.status;
                    const first = booking && booking.start === cell.start;
                    const bookingEnd = booking
                      ? clock(minutesOf(booking.start) + booking.minutes)
                      : "";
                    return (
                      <td key={day.date} className="p-0">
                        <button
                          type="button"
                          onClick={() => !booking && click(cell)}
                          disabled={cell.status === "PAST" || Boolean(booking)}
                          title={
                            booking
                              ? `Booked ${booking.start}–${bookingEnd} · ${booking.customer} · ${booking.payment === "PAID" ? "paid" : "not paid"}`
                              : cell.status === "BLOCKED"
                                ? `${REASON_LABEL[cell.blockReason!]}: tap to unblock`
                                : cell.status === "FREE"
                                  ? `Free ${cell.start}–${end} · tap to block`
                                  : "Past"
                          }
                          className={cn(
                            "h-8 w-full truncate rounded-md px-1.5 font-mono text-[11px] tabular-nums transition-colors disabled:cursor-default",
                            CELL[status],
                            booking && !first && "text-transparent",
                            booking && cell.status === "PAST" && "opacity-60",
                          )}
                        >
                          {booking ? (
                            <>
                              {booking.start}–{bookingEnd}
                              <span className="font-sans"> · {booking.customer.split(" ")[0]}</span>
                            </>
                          ) : cell.status === "BLOCKED" ? (
                            <span className="font-sans">{REASON_LABEL[cell.blockReason!]}</span>
                          ) : cell.status === "FREE" ? (
                            `${cell.start}–${end}`
                          ) : (
                            ""
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Widget>
  );
}

function PlayerSlots({
  courtId,
  schedule,
  timezone,
}: {
  courtId: string;
  schedule: CourtSchedule;
  timezone: string;
}) {
  const dates = Array.from({ length: 7 }, (_, i) => todayAt(timezone, i));
  const [date, setDate] = useState(dates[0]!);
  const lengths = schedule.durations;
  const [minutes, setMinutes] = useState(lengths[0]?.minutes ?? 60);
  const sport = lengths.find((d) => d.minutes === minutes)?.sport ?? undefined;
  const slots = useQuery({
    queryKey: ["slots", courtId, date, minutes, sport],
    queryFn: () =>
      api<CourtSlots>(
        `/courts/${courtId}/slots?date=${date}&minutes=${minutes}${sport ? `&sport=${sport}` : ""}`,
      ),
    enabled: lengths.length > 0,
    retry: false,
  });
  return (
    <Widget>
      <WidgetHeader
        title="What players see"
        icon={SmartphoneIcon}
        action={<Badge variant="outline">Public, no sign-in</Badge>}
      />
      <div className="flex flex-col gap-3 px-(--card-spacing) pb-(--card-spacing)">
        <div className="flex flex-wrap gap-2">
          <NativeSelect size="sm" value={date} onChange={(e) => setDate(e.target.value)}>
            {dates.map((d, i) => (
              <NativeSelectOption key={d} value={d}>
                {i === 0 ? "Today" : dayLabel(d)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            size="sm"
            value={String(minutes)}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            {lengths.map((d) => (
              <NativeSelectOption key={`${d.minutes}-${d.sport}`} value={String(d.minutes)}>
                {d.label ? `${d.label} · ${lengthLabel(d.minutes)}` : lengthLabel(d.minutes)}
                {d.sport ? ` (${SPORT_LABEL[d.sport]})` : ""}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {slots.isError ? (
          <p className="text-sm text-muted-foreground">{(slots.error as Error).message}</p>
        ) : !slots.data ? (
          <Skeleton className="h-24" />
        ) : slots.data.slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No slots left on this day.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {slots.data.slots.map((slot) => (
              <div
                key={slot.startsAt}
                className={cn(
                  "flex flex-col rounded-lg border px-3 py-2",
                  slot.status === "FREE"
                    ? "border-chart-lead/40 bg-chart-lead/5"
                    : "border-dashed opacity-60",
                )}
              >
                <span className="font-mono text-sm font-medium tabular-nums">
                  {slot.start}–{slot.end}
                </span>
                <span className="text-xs text-muted-foreground">
                  {slot.status === "BLOCKED"
                    ? "Not available"
                    : slot.pricePaise !== null
                      ? inr(slot.pricePaise)
                      : "No price set"}
                  {slot.ruleName && slot.status === "FREE" ? ` · ${slot.ruleName}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Widget>
  );
}

export function AvailabilityPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { venue, courts, role, loading } = useCurrentVenue();
  const manager = role === "OWNER" || role === "MANAGER";
  const court = courts.find((c) => c.id === params.get("court")) ?? courts[0];
  const courtId = court?.id;
  const schedule = useQuery({
    queryKey: ["schedule", courtId],
    queryFn: () => api<CourtSchedule>(`/courts/${courtId}/schedule`),
    enabled: Boolean(courtId),
  });
  const prices = useQuery({
    queryKey: ["prices", courtId],
    queryFn: () => api<CourtPrices>(`/courts/${courtId}/prices`),
    enabled: Boolean(courtId) && manager,
  });

  if (loading) return <AvailabilitySkeleton />;
  if (!venue || !courtId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Availability & pricing"
          description="Opening hours, booking lengths, prices and blocks for each court."
        />
        <NoVenue />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Availability & pricing"
        description="Opening hours, booking lengths, prices and blocks for each court. Everything here is the real API."
        meta={<LiveBadge />}
        actions={
          <Segmented
            aria-label="Court"
            value={courtId}
            onChange={(id) => router.replace(`/availability?court=${id}`)}
            options={courts.map((c) => ({ value: c.id, label: c.name }))}
          />
        }
      />

      <WeekGrid
        courtId={courtId}
        venueId={venue.id}
        timezone={venue.timezone}
        courtName={courts.find((c) => c.id === courtId)?.name ?? ""}
        courtNames={courts.map((c) => c.name)}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        {schedule.data && court ? (
          <ScheduleCard court={court} schedule={schedule.data} manager={manager} />
        ) : (
          <Skeleton className="h-64 rounded-2xl" />
        )}

        {!manager ? (
          <Widget className="xl:col-span-2">
            <WidgetHeader title="Prices" icon={IndianRupeeIcon} />
            <p className="px-(--card-spacing) text-sm text-muted-foreground">
              Only owners and managers see prices.
            </p>
          </Widget>
        ) : !prices.data || !schedule.data ? (
          <Skeleton className="h-64 rounded-2xl xl:col-span-2" />
        ) : (
          <PricesCard
            key={courtId}
            className="xl:col-span-2"
            courtId={courtId}
            prices={prices.data}
            durations={schedule.data.durations}
            manager={manager}
          />
        )}
      </div>

      {schedule.data && (
        <PlayerSlots
          key={courtId}
          courtId={courtId}
          schedule={schedule.data}
          timezone={venue.timezone}
        />
      )}
    </div>
  );
}
