import { useQueries } from "@tanstack/react-query";
import {
  PlusIcon,
  ArrowRightIcon,
  BanIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  Clock3Icon,
  IndianRupeeIcon,
  LandPlotIcon,
  TriangleAlertIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";

import { Link } from "@/kit/framework";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/kit/ui-patterns/page-header";
import { StatusBadge } from "@/kit/ui-patterns/status-badge";
import { Widget, WidgetHeader, WidgetValue } from "@/kit/widgets/widget";
import { api } from "@/lib/api";
import { demoBookings } from "@/lib/demo-data";
import { delta, periodMetrics } from "@/lib/metrics";
import { addDays, datesIn } from "@/lib/period";
import { useCurrentVenue, useMe } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  dayLabel,
  inr,
  inrCompact,
  todayAt,
  type Court,
  type CourtGrid,
  type CourtPrices,
  type CourtSchedule,
  type GridCell,
} from "@/lib/yoorker";
import { DEV_NOTES } from "@/lib/dev-notes";

import { LiveBadge, NoVenue } from "./common";
import {
  RecentActivity,
  RevenueCard,
  StatCards,
  UpcomingBookings,
  VenuePerformance,
  type Stat,
} from "./overview-cards";
import { PeriodFilter, usePeriod } from "./period-filter";
import { OverviewSkeleton } from "./page-skeletons";

function useGreeting() {
  return useSyncExternalStore(
    () => () => {},
    () => {
      const hour = Number(
        new Intl.DateTimeFormat("en-GB", {
          hour: "numeric",
          hour12: false,
          timeZone: "Asia/Kolkata",
        }).format(new Date()),
      );
      return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    },
    () => "Welcome back",
  );
}

const CELL_TONE: Record<GridCell["status"], string> = {
  FREE: "bg-chart-lead/70",
  HELD: "bg-warning",
  BOOKED: "bg-chart-2",
  BLOCKED:
    "bg-[repeating-linear-gradient(135deg,var(--destructive)_0_4px,transparent_4px_8px)] bg-destructive/20",
  PAST: "bg-muted",
};

export function TodayStrip({ cells }: { cells: GridCell[] }) {
  if (cells.length === 0)
    return <p className="text-xs text-muted-foreground">Closed today, or no opening hours set.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-7 gap-px overflow-hidden rounded-md">
        {cells.map((cell) => (
          <span
            key={cell.startsAt}
            className={cn("min-w-0 flex-1", CELL_TONE[cell.status])}
            title={`${cell.start} · ${cell.status === "BLOCKED" ? `Blocked (${cell.blockReason?.toLowerCase().replace("_", " ")})` : cell.status.toLowerCase()}`}
          />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>{cells[0]!.start}</span>
        <span>{cells[Math.floor(cells.length / 2)]!.start}</span>
        <span>{cells.at(-1)!.start}</span>
      </div>
    </div>
  );
}

export function OverviewPage() {
  const greeting = useGreeting();
  const me = useMe();
  const { venue, courts, role, loading } = useCurrentVenue();
  const today = todayAt(venue?.timezone);
  const period = usePeriod(today);
  const manager = role === "OWNER" || role === "MANAGER";

  const grids = useQueries({
    queries: courts.map((court) => ({
      queryKey: ["grid", court.id, today, 1],
      queryFn: () => api<CourtGrid>(`/courts/${court.id}/grid?from=${today}&days=1`),
    })),
  });
  const schedules = useQueries({
    queries: courts.map((court) => ({
      queryKey: ["schedule", court.id],
      queryFn: () => api<CourtSchedule>(`/courts/${court.id}/schedule`),
    })),
  });
  const prices = useQueries({
    queries: courts.map((court) => ({
      queryKey: ["prices", court.id],
      queryFn: () => api<CourtPrices>(`/courts/${court.id}/prices`),
      enabled: manager,
    })),
  });

  const openByCourt = useMemo(
    () =>
      schedules.map((query) => {
        const minutes = Array(8).fill(0) as number[];
        for (const day of query.data?.days ?? []) {
          for (const w of day.windows) {
            const [oh, om] = w.opens.split(":").map(Number);
            const [ch, cm] = w.closes.split(":").map(Number);
            let length = ch! * 60 + cm! - (oh! * 60 + om!);
            if (length <= 0) length += 1440;
            minutes[day.weekday]! += length;
          }
        }
        return minutes;
      }),
    [schedules],
  );
  const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  const openMinutes = (date: string) =>
    openByCourt.reduce((sum, minutes) => sum + (minutes[weekdayOf(date)] ?? 0), 0) ||
    courts.length * 17 * 60;
  const datesSoFar = datesIn(period.range).filter((d) => d <= today);
  const courtOpenMinutes = (court: Court) => {
    const minutes = openByCourt[courts.indexOf(court)];
    return datesSoFar.reduce((sum, d) => sum + (minutes?.[weekdayOf(d)] ?? 17 * 60), 0);
  };

  const all = demoBookings(
    today,
    courts.map((c) => c.name),
  );
  const now = periodMetrics(all, period.range, today, openMinutes);
  const before = periodMetrics(all, period.previous, today, openMinutes);
  const vs = period.range.days === 1 ? "yesterday" : `the ${period.range.days} days before`;

  if (loading) return <OverviewSkeleton />;
  if (!venue) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={`${greeting}${me.data?.user.name ? `, ${me.data.user.name.split(" ")[0]}` : ""}`}
          description="Let's set up your venue."
        />
        <NoVenue />
      </div>
    );
  }

  const liveCells = grids.flatMap((g) => g.data?.days[0]?.cells ?? []);
  const step = grids[0]?.data?.startStepMinutes ?? 30;
  const hoursOf = (cells: GridCell[], status: GridCell["status"]) =>
    Math.round((cells.filter((c) => c.status === status).length * step) / 60);
  const unpaidToday = all.filter(
    (b) => b.date === today && b.payment === "NOT_PAID" && b.booking !== "CANCELLED",
  );

  const setup = courts.flatMap((court, i) => {
    const s = schedules[i]?.data;
    const p = prices[i]?.data;
    const issues: { court: string; text: string; href: string }[] = [];
    if (s && s.days.every((d) => d.windows.length === 0))
      issues.push({
        court: court.name,
        text: "No opening hours: players can't book it",
        href: `/availability?court=${court.id}`,
      });
    if (s && s.durations.length === 0)
      issues.push({
        court: court.name,
        text: "No booking lengths set",
        href: `/availability?court=${court.id}`,
      });
    if (manager && p && p.basePricePerHourPaise === null && p.rules.length === 0)
      issues.push({
        court: court.name,
        text: "No prices: slots show without a price",
        href: `/availability?court=${court.id}`,
      });
    if (!court.isActive)
      issues.push({
        court: court.name,
        text: "Turned off: hidden from players",
        href: "/venues",
      });
    return issues;
  });

  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: venue.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const upcoming = all
    .filter(
      (b) =>
        b.booking === "CONFIRMED" && (b.date > today || (b.date === today && b.start >= clock)),
    )
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const nextWeek = addDays(today, 7);
  const upcomingWeek = upcoming.filter((b) => b.date <= nextWeek);
  const upcomingUnpaid = upcomingWeek.filter((b) => b.payment === "NOT_PAID").length;

  const stats: Stat[] = [
    {
      label: "Total bookings",
      value: String(now.bookings),
      icon: CalendarCheckIcon,
      delta: delta(now.bookings, before.bookings),
      caption: `vs ${before.bookings} ${vs}`,
    },
    {
      label: "Revenue",
      value: inrCompact(now.earningsPaise),
      icon: IndianRupeeIcon,
      delta: delta(now.earningsPaise, before.earningsPaise),
      caption: `${inr(now.earningsPaise)} collected`,
    },
    {
      label: "Upcoming",
      value: String(upcomingWeek.length),
      icon: CalendarClockIcon,
      delta: null,
      caption: `next 7 days · ${upcomingUnpaid} not paid yet`,
    },
    {
      label: "Cancelled",
      value: String(now.cancelled),
      icon: BanIcon,
      delta: delta(now.cancelled, before.cancelled),
      invert: true,
      caption: `${now.noShows} no-shows · vs ${before.cancelled} cancelled`,
    },
    {
      label: "Customers",
      value: String(now.customers),
      icon: UsersIcon,
      delta: delta(now.customers, before.customers),
      caption: `${now.newCustomers} new · first booking here`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="sm:flex-col sm:items-start lg:flex-row lg:items-end"
        title={`${greeting}${me.data?.user.name ? `, ${me.data.user.name.split(" ")[0]}` : ""}`}
        description={
          <>
            {dayLabel(today)} · {venue.name}, {venue.locality ? `${venue.locality}, ` : ""}
            {venue.city.name} · <span className="font-mono tabular-nums">{courts.length}</span>{" "}
            courts
          </>
        }
        actions={
          <>
            <Link href="/availability" className={buttonVariants({ variant: "outline" })}>
              <Clock3Icon data-icon="inline-start" />
              Block a court
            </Link>
            <Link href="/bookings?new=true" className={buttonVariants()}>
              <PlusIcon data-icon="inline-start" />
              New booking
            </Link>
          </>
        }
      />

      <PeriodFilter today={today} state={period} />

      <StatCards stats={stats} />

      <div className="grid gap-4 xl:grid-cols-3">
        <RevenueCard
          now={now}
          before={before}
          vs={vs}
          days={period.range.days}
          chartKey={`${period.range.from}-${period.range.to}`}
        />
        <UpcomingBookings bookings={upcoming.slice(0, 5)} today={today} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <VenuePerformance
          courts={courts}
          now={now}
          before={before}
          openMinutes={courtOpenMinutes}
        />
        <RecentActivity
          organisationId={venue.organisationId}
          manager={manager}
          courts={courts}
          bookings={upcoming}
          today={today}
        />
      </div>

      <div className="flex items-center gap-2 pt-2">
        <h2 className="text-base font-semibold">Right now</h2>
        <span className="text-sm text-muted-foreground">
          · {dayLabel(today)}, always today whatever period you pick
        </span>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Widget className="xl:col-span-2">
          <WidgetHeader
            title={
              <span className="flex items-center gap-2">
                Today&apos;s courts
                <LiveBadge />
              </span>
            }
            icon={LandPlotIcon}
            action={
              <Link
                href="/availability"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Open grid
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            }
          />
          <WidgetValue
            value={`${hoursOf(liveCells, "FREE")} h free`}
            delta={null}
            caption={`${hoursOf(liveCells, "BLOCKED")} h blocked · ${hoursOf(liveCells, "PAST")} h already gone`}
          />
          <div className="flex flex-col gap-5 px-(--card-spacing) pb-(--card-spacing)">
            {courts.map((court, i) => (
              <div key={court.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{court.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {court.sports.map((s) => s[0] + s.slice(1).toLowerCase()).join(" · ")}
                  </span>
                </div>
                {grids[i]?.data ? (
                  <TodayStrip cells={grids[i]!.data!.days[0]?.cells ?? []} />
                ) : (
                  <Skeleton className="h-7" />
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-chart-lead/70" />
                Free
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-destructive/40" />
                Blocked
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-muted" />
                Past
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-chart-2" />
                Booked{DEV_NOTES && " (Sprint 3)"}
              </span>
            </div>
          </div>
        </Widget>

        <Widget>
          <WidgetHeader
            title={
              <span className="flex items-center gap-2">
                Needs attention
                <StatusBadge tone={setup.length + unpaidToday.length ? "danger" : "success"}>
                  {setup.length + unpaidToday.length} open
                </StatusBadge>
              </span>
            }
          />
          {setup.length + unpaidToday.length === 0 ? (
            <p className="flex items-center gap-2 px-(--card-spacing) text-sm text-muted-foreground">
              <CheckCircle2Icon className="size-4 text-success" /> Nothing needs you right now.
            </p>
          ) : (
            <ul className="mx-(--card-spacing) divide-y divide-border/60">
              {setup.map((item) => (
                <li
                  key={item.court + item.text}
                  className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                    <TriangleAlertIcon className="size-4 text-warning" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{item.court}</span>
                    <span className="truncate text-xs text-muted-foreground">{item.text}</span>
                  </div>
                  <Link
                    href={item.href}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Fix
                  </Link>
                </li>
              ))}
              {unpaidToday.slice(0, 4).map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <WalletIcon className="size-4 text-muted-foreground" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{b.customer}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      Walk-in · {b.court}, {b.start} ·{" "}
                      <span className="text-foreground">{inr(b.pricePaise)}</span> not paid
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    title={DEV_NOTES ? "Cash collection arrives in Sprint 4" : "Coming soon"}
                  >
                    Collect
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {DEV_NOTES && (
            <p className="px-(--card-spacing) pt-3 text-xs text-muted-foreground">
              Setup items are live from the API; unpaid walk-ins are sample data.
            </p>
          )}
        </Widget>
      </div>
    </div>
  );
}
