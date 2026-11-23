import { useQueries } from "@tanstack/react-query";
import {
  BanIcon,
  CircleCheckIcon,
  ClockIcon,
  MoonIcon,
  PlayIcon,
  PlusIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Link } from "@/kit/framework";
import { buttonVariants, Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { PageHeader } from "@/kit/ui-patterns/page-header";
import { StatusBadge, type Tone } from "@/kit/ui-patterns/status-badge";
import { Widget } from "@/kit/widgets/widget";
import { api } from "@/lib/api";
import { demoBookings, type DemoBooking } from "@/lib/demo-data";
import { useManualBookings } from "@/lib/manual-bookings";
import { useCurrentVenue } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  inr,
  lengthLabel,
  REASON_LABEL,
  todayAt,
  type CourtGrid,
  type GridCell,
} from "@/lib/yoorker";
import { DEV_NOTES } from "@/lib/dev-notes";

import { LiveBadge, NoVenue } from "./common";
import { LiveSkeleton } from "./page-skeletons";

type State = "PLAYING" | "FREE" | "BLOCKED" | "CLOSED";

const STATE: Record<State, { label: string; tone: Tone; icon: LucideIcon }> = {
  PLAYING: { label: "Playing", tone: "info", icon: PlayIcon },
  FREE: { label: "Free", tone: "success", icon: CircleCheckIcon },
  BLOCKED: { label: "Blocked", tone: "danger", icon: BanIcon },
  CLOSED: { label: "Closed", tone: "muted", icon: MoonIcon },
};

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

const clockOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** "1 h 40 m" from minutes. */
const span = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} m` : h ? `${h} h` : `${m} m`;
};

/** A cell's start as minutes since the day began, past midnight counted on (24:30 = 1470). */
const cellStart = (cell: GridCell, previous: number) => {
  let m = minutesOf(cell.start);
  while (m < previous) m += 1440;
  return m;
};

interface CourtNow {
  state: State;
  playing?: DemoBooking;
  /** When the current state ends, in minutes since midnight. */
  until?: number;
  reason?: string;
  /** First free start after now. */
  nextFree?: number;
  upNext: DemoBooking[];
  /** Each cell's start and what it shows on the timeline. */
  cells: { start: number; end: number; kind: "free" | "booked" | "blocked" }[];
}

function courtNow(cells: GridCell[], bookings: DemoBooking[], now: number): CourtNow {
  // Times for each cell, in order, so a day running past midnight stays in order.
  const step =
    cells.length > 1
      ? (Date.parse(cells[1]!.startsAt) - Date.parse(cells[0]!.startsAt)) / 60000
      : 30;
  let previous = 0;
  const timed = cells.map((cell) => {
    const start = cellStart(cell, previous);
    previous = start;
    return { cell, start, end: start + step };
  });
  const bookingAt = (minute: number) =>
    bookings.find((b) => minutesOf(b.start) <= minute && minute < minutesOf(b.start) + b.minutes);
  const kindOf = (t: (typeof timed)[number]) =>
    t.cell.status === "BLOCKED"
      ? ("blocked" as const)
      : bookingAt(t.start)
        ? ("booked" as const)
        : ("free" as const);
  const strip = timed.map((t) => ({
    start: t.start,
    end: t.end,
    kind: kindOf(t),
  }));

  const nextFree = strip.find((t) => t.start > now && t.kind === "free")?.start;
  const upNext = bookings
    .filter((b) => minutesOf(b.start) > now)
    .sort((a, b) => minutesOf(a.start) - minutesOf(b.start))
    .slice(0, 3);
  const index = strip.findIndex((t) => t.start <= now && now < t.end);
  const base = { nextFree, upNext, cells: strip };

  if (index === -1) {
    const opens = strip.find((t) => t.start > now)?.start;
    return { ...base, state: "CLOSED", until: opens };
  }
  const here = strip[index]!;
  if (here.kind === "blocked") {
    let end = index;
    while (strip[end + 1]?.kind === "blocked") end++;
    return {
      ...base,
      state: "BLOCKED",
      until: strip[end]!.end,
      reason: timed[index]!.cell.blockReason
        ? REASON_LABEL[timed[index]!.cell.blockReason!]
        : undefined,
    };
  }
  const playing = bookingAt(now);
  if (playing) {
    return {
      ...base,
      state: "PLAYING",
      playing,
      until: minutesOf(playing.start) + playing.minutes,
    };
  }
  // Free until the next booking, block or closing time.
  let end = index;
  while (strip[end + 1]?.kind === "free") end++;
  return { ...base, state: "FREE", until: strip[end]!.end };
}

/** Today's opening hours as one bar: free, booked, blocked and gone, with a line at now. */
function Timeline({ data, now }: { data: CourtNow; now: number }) {
  const { cells } = data;
  if (cells.length === 0)
    return <p className="text-xs text-muted-foreground">No opening hours today.</p>;
  const first = cells[0]!.start;
  const last = cells.at(-1)!.end;
  const at = Math.min(1, Math.max(0, (now - first) / (last - first)));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <div className="flex h-3 gap-px overflow-hidden rounded-full">
          {cells.map((c) => (
            <span
              key={c.start}
              title={`${clockOf(c.start)} · ${c.kind}`}
              className={cn(
                "min-w-0 flex-1",
                c.kind === "booked"
                  ? "bg-info/70"
                  : c.kind === "blocked"
                    ? "bg-destructive/60"
                    : "bg-success/45",
                c.end <= now && "opacity-35",
              )}
            />
          ))}
        </div>
        {now > first && now < last && (
          <span
            className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground"
            style={{ left: `${at * 100}%` }}
            aria-hidden
          />
        )}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>{clockOf(first)}</span>
        <span>{clockOf(last)}</span>
      </div>
    </div>
  );
}

function CourtCard({
  name,
  data,
  now,
  loading,
}: {
  name: string;
  data: CourtNow | null;
  now: number;
  loading: boolean;
}) {
  if (loading || !data) return <Skeleton className="h-80 rounded-2xl" />;
  const meta = STATE[data.state];
  const Icon = meta.icon;
  const p = data.playing;
  const progress = p ? Math.min(1, (now - minutesOf(p.start)) / p.minutes) : 0;

  return (
    <Widget className="h-full">
      <div className="flex items-center justify-between gap-3 px-(--card-spacing)">
        <span className="truncate text-base font-semibold">{name}</span>
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      </div>

      {/* Now */}
      <div className="mx-(--card-spacing) flex min-h-36 flex-col gap-3 rounded-xl bg-muted/50 p-4">
        <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Icon className="size-3.5" />
          Now
        </span>
        {p ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{p.customer}</span>
                <span className="font-mono text-sm text-muted-foreground tabular-nums">
                  {p.start}–{clockOf(minutesOf(p.start) + p.minutes)} · {lengthLabel(p.minutes)}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono text-sm tabular-nums">{inr(p.pricePaise)}</span>
                <StatusBadge tone={p.payment === "PAID" ? "success" : "warning"}>
                  {p.payment === "PAID" ? "Paid" : "Not paid"}
                </StatusBadge>
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-background/60">
                <span
                  className="block h-full rounded-full bg-info"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {span(Math.max(0, data.until! - now))} left
              </span>
            </div>
            {p.payment !== "PAID" && (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() =>
                  toast.add({
                    type: "success",
                    title: `${inr(p.pricePaise)} collected from ${p.customer}`,
                    description: DEV_NOTES ? "Cash collection is saved from Sprint 4." : undefined,
                  })
                }
              >
                Collect {inr(p.pricePaise)}
              </Button>
            )}
          </>
        ) : data.state === "FREE" ? (
          <>
            <span className="text-lg font-semibold">
              Free until <span className="font-mono tabular-nums">{clockOf(data.until!)}</span>
            </span>
            <span className="text-sm text-muted-foreground">
              {span(data.until! - now)} open. A walk-in can take it now.
            </span>
            <Link
              href="/bookings?new=true"
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "mt-auto self-start",
              )}
            >
              <PlusIcon data-icon="inline-start" />
              Book a walk-in
            </Link>
          </>
        ) : data.state === "BLOCKED" ? (
          <>
            <span className="text-lg font-semibold">{data.reason ?? "Blocked"}</span>
            <span className="text-sm text-muted-foreground">
              Until{" "}
              <span className="font-mono text-foreground tabular-nums">{clockOf(data.until!)}</span>
              . Players can&apos;t book it.
            </span>
          </>
        ) : (
          <>
            <span className="text-lg font-semibold">Closed</span>
            <span className="text-sm text-muted-foreground">
              {data.until !== undefined ? (
                <>
                  Opens at{" "}
                  <span className="font-mono text-foreground tabular-nums">
                    {clockOf(data.until)}
                  </span>
                  .
                </>
              ) : (
                "Done for today."
              )}
            </span>
          </>
        )}
      </div>

      {/* Up next */}
      <div className="flex flex-1 flex-col gap-2 px-(--card-spacing)">
        <span className="flex items-center justify-between text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Up next
          {data.state !== "FREE" && data.nextFree !== undefined && (
            <span className="font-normal tracking-normal normal-case">
              Next free{" "}
              <span className="font-mono text-foreground tabular-nums">
                {clockOf(data.nextFree)}
              </span>
            </span>
          )}
        </span>
        {data.upNext.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Nothing else booked today.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {data.upNext.map((b) => (
              <li
                key={b.id}
                className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 py-2"
              >
                <span className="font-mono text-sm tabular-nums">{b.start}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{b.customer}</span>
                  <span className="text-xs text-muted-foreground">
                    {lengthLabel(b.minutes)}
                    {b.source === "WALK_IN" ? " · Walk-in" : ""}
                  </span>
                </span>
                <StatusBadge tone={b.payment === "PAID" ? "success" : "warning"}>
                  {b.payment === "PAID" ? "Paid" : "Not paid"}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto px-(--card-spacing)">
        <Timeline data={data} now={now} />
      </div>
    </Widget>
  );
}

/** What each court is doing right now. The grid is live; who is playing is sample data until Sprint 3. */
export function LivePage() {
  const { venue, courts, loading } = useCurrentVenue();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const today = todayAt(venue?.timezone);
  const manual = useManualBookings((state) => state.bookings);
  const grids = useQueries({
    queries: courts.map((court) => ({
      queryKey: ["grid", court.id, today, 1],
      queryFn: () => api<CourtGrid>(`/courts/${court.id}/grid?from=${today}&days=1`),
      refetchInterval: 30_000,
    })),
  });
  if (loading) return <LiveSkeleton />;
  if (!venue) return <NoVenue />;

  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: venue.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const nowMinute = minutesOf(clock);
  const todays = [
    ...demoBookings(
      today,
      courts.map((c) => c.name),
    ),
    ...manual,
  ].filter((b) => b.date === today && b.booking !== "CANCELLED");

  const states = courts.map((court, i) => {
    const grid = grids[i]?.data;
    return grid
      ? courtNow(
          grid.days[0]?.cells ?? [],
          todays.filter((b) => b.court === court.name),
          nowMinute,
        )
      : null;
  });
  const count = (state: State) => states.filter((s) => s?.state === state).length;
  const nextStart = todays
    .filter((b) => minutesOf(b.start) > nowMinute)
    .sort((a, b) => minutesOf(a.start) - minutesOf(b.start))[0];

  const summary: { label: string; value: string; tone: string }[] = [
    { label: "Playing now", value: String(count("PLAYING")), tone: "bg-info" },
    { label: "Free now", value: String(count("FREE")), tone: "bg-success" },
    {
      label: "Blocked or closed",
      value: String(count("BLOCKED") + count("CLOSED")),
      tone: "bg-muted-foreground/50",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Live board"
        description="What every court is doing right now. Updates every 30 seconds."
        meta={<LiveBadge />}
      />

      <Widget className="py-4">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4 px-(--card-spacing)">
          <span className="flex items-center gap-2.5">
            <ClockIcon className="size-5 text-muted-foreground" />
            <span className="font-mono text-2xl font-semibold tabular-nums">{clock}</span>
          </span>
          {summary.map((s) => (
            <span key={s.label} className="flex items-center gap-2.5">
              <span className={cn("size-2.5 rounded-full", s.tone)} />
              <span className="font-mono text-xl font-semibold tabular-nums">{s.value}</span>
              <span className="text-sm text-muted-foreground">{s.label}</span>
            </span>
          ))}
          <span className="text-sm text-muted-foreground sm:ms-auto">
            {nextStart ? (
              <>
                Next start{" "}
                <span className="font-mono text-foreground tabular-nums">{nextStart.start}</span> ·{" "}
                {nextStart.customer}, {nextStart.court}
              </>
            ) : (
              "No more bookings today"
            )}
          </span>
        </div>
      </Widget>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {courts.map((court, i) => (
          <CourtCard
            key={court.id}
            name={court.name}
            data={states[i] ?? null}
            now={nowMinute}
            loading={!grids[i]?.data}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-success/45" /> Free
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-info/70" /> Booked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-destructive/60" /> Blocked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 rounded-full bg-foreground" /> Now
        </span>
        {DEV_NOTES && (
          <span>· Who is playing is sample data until bookings arrive in Sprint 3.</span>
        )}
      </div>
    </div>
  );
}
