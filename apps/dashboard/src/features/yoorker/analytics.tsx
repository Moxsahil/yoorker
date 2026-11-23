import { useQueries } from "@tanstack/react-query";
import { ChartColumnIcon, ClockIcon, Grid3x3Icon, LandPlotIcon, ShuffleIcon } from "lucide-react";
import { useMemo } from "react";

import { HourBars } from "@/components/yoorker/charts";
import { Heatmap } from "@/components/yoorker/heatmap";
import { change, formatPercent } from "@/kit/data/format";
import { PageHeader } from "@/kit/ui-patterns/page-header";
import { Delta, Widget, WidgetHeader } from "@/kit/widgets/widget";
import { api } from "@/lib/api";
import { demoBookings, type DemoBooking } from "@/lib/demo-data";
import { FIRST_HOUR, HOURS, periodMetrics } from "@/lib/metrics";
import { type DateRange } from "@/lib/period";
import { useCurrentVenue } from "@/lib/session";
import { inr, lengthLabel, todayAt, WEEKDAY_SHORT, type CourtSchedule } from "@/lib/yoorker";

import { NoVenue, SampleBadge } from "./common";
import { PeriodFilter, usePeriod } from "./period-filter";
import { AnalyticsSkeleton } from "./page-skeletons";

const hourName = (hour: number) => `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`;

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;

const played = (all: DemoBooking[], range: DateRange, today: string) =>
  all.filter(
    (b) =>
      b.date >= range.from && b.date <= range.to && b.date <= today && b.booking !== "CANCELLED",
  );

function repeatRate(all: DemoBooking[], range: DateRange, today: string) {
  const first = new Map<string, string>();
  for (const b of all) {
    if (b.booking === "CANCELLED" || b.date > today) continue;
    const seen = first.get(b.customer);
    if (!seen || b.date < seen) first.set(b.customer, b.date);
  }
  const players = new Set(played(all, range, today).map((b) => b.customer));
  if (players.size === 0) return 0;
  return [...players].filter((name) => first.get(name)! < range.from).length / players.size;
}

function cancelRate(all: DemoBooking[], range: DateRange, today: string) {
  const inRange = all.filter((b) => b.date >= range.from && b.date <= range.to && b.date <= today);
  return inRange.length
    ? inRange.filter((b) => b.booking === "CANCELLED").length / inRange.length
    : 0;
}

function Kpi({
  label,
  value,
  delta,
  caption,
  invert = false,
}: {
  label: string;
  value: string;
  delta: number | null;
  caption: string;
  invert?: boolean;
}) {
  return (
    <Widget className="gap-1.5">
      <span className="px-(--card-spacing) text-sm text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-2 px-(--card-spacing)">
        <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
        <Delta value={delta} invert={invert} className="text-xs" />
      </span>
      <span className="px-(--card-spacing) text-xs text-muted-foreground">{caption}</span>
    </Widget>
  );
}

export function AnalyticsPage() {
  const { venue, courts, loading } = useCurrentVenue();
  const today = todayAt(venue?.timezone);
  const period = usePeriod(today);
  const { range, previous } = period;

  const schedules = useQueries({
    queries: courts.map((court) => ({
      queryKey: ["schedule", court.id],
      queryFn: () => api<CourtSchedule>(`/courts/${court.id}/schedule`),
    })),
  });
  const openByWeekday = useMemo(() => {
    const minutes = Array(8).fill(0) as number[];
    for (const query of schedules)
      for (const day of query.data?.days ?? [])
        for (const w of day.windows) {
          const [oh, om] = w.opens.split(":").map(Number);
          const [ch, cm] = w.closes.split(":").map(Number);
          let length = ch! * 60 + cm! - (oh! * 60 + om!);
          if (length <= 0) length += 1440;
          minutes[day.weekday]! += length;
        }
    return minutes;
  }, [schedules]);
  const openMinutes = (date: string) => openByWeekday[weekdayOf(date)] || courts.length * 17 * 60;

  const all = demoBookings(
    today,
    courts.map((c) => c.name),
  );
  const now = periodMetrics(all, range, today, openMinutes);
  const before = periodMetrics(all, previous, today, openMinutes);
  const repeatNow = repeatRate(all, range, today);
  const repeatBefore = repeatRate(all, previous, today);
  const cancelNow = cancelRate(all, range, today);
  const cancelBefore = cancelRate(all, previous, today);
  const list = played(all, range, today);

  const heat = WEEKDAY_SHORT.map((_, d) =>
    Array.from(
      { length: HOURS },
      (_, h) =>
        list.filter(
          (b) => weekdayOf(b.date) === d + 1 && Number(b.start.slice(0, 2)) === FIRST_HOUR + h,
        ).length,
    ),
  );
  const busiest = heat
    .flatMap((row, d) => row.map((value, h) => ({ value, d, h })))
    .reduce((best, cell) => (cell.value > best.value ? cell : best), {
      value: 0,
      d: 0,
      h: 0,
    });

  const revenue = courts
    .map((c) => ({
      name: c.name,
      paise: now.byCourtRevenue[c.name] ?? 0,
      bookings: now.byCourt[c.name] ?? 0,
    }))
    .sort((a, b) => b.paise - a.paise);
  const totalRevenue = revenue.reduce((s, r) => s + r.paise, 0) || 1;

  const lengths = [...new Set(list.map((b) => b.minutes))]
    .sort((a, b) => a - b)
    .map((minutes) => ({
      minutes,
      count: list.filter((b) => b.minutes === minutes).length,
    }));
  const online = list.filter((b) => b.source === "ONLINE").length;

  if (loading) return <AnalyticsSkeleton />;
  if (!venue) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Analytics" />
        <NoVenue />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        description="When players come, what they book and what earns the most."
        meta={<SampleBadge sprint="Sprint 8" />}
      />
      <PeriodFilter today={today} state={period} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Occupancy"
          value={formatPercent(now.occupancy, { decimals: 0 })}
          delta={change(now.occupancy, before.occupancy)}
          caption="of open court time was booked"
        />
        <Kpi
          label="Average booking"
          value={inr(now.avgBookingPaise)}
          delta={change(now.avgBookingPaise, before.avgBookingPaise)}
          caption="paid per booking"
        />
        <Kpi
          label="Repeat players"
          value={formatPercent(repeatNow, { decimals: 0 })}
          delta={change(repeatNow, repeatBefore)}
          caption="had played here before"
        />
        <Kpi
          label="Cancellations"
          value={formatPercent(cancelNow, { decimals: 0 })}
          delta={change(cancelNow, cancelBefore)}
          caption="of bookings were cancelled"
          invert
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Widget className="xl:col-span-2">
          <WidgetHeader title="Busiest times" icon={Grid3x3Icon} />
          <p className="-mt-2 px-(--card-spacing) text-sm text-muted-foreground">
            {busiest.value > 0 ? (
              <>
                Busiest:{" "}
                <span className="font-medium text-foreground">
                  {WEEKDAY_SHORT[busiest.d]} {hourName(FIRST_HOUR + busiest.h)}
                </span>
                , {busiest.value} bookings starting then. Empty cells are hours you could fill with
                an offer.
              </>
            ) : (
              "No bookings in this period yet."
            )}
          </p>
          <div className="px-(--card-spacing)">
            <Heatmap
              rows={WEEKDAY_SHORT}
              columns={Array.from({ length: HOURS }, (_, i) => hourName(FIRST_HOUR + i))}
              values={heat}
              format={(v) => `${v} booking${v === 1 ? "" : "s"}`}
              label="Bookings by weekday and start hour"
            />
          </div>
        </Widget>

        <Widget>
          <WidgetHeader title="Revenue by court" icon={LandPlotIcon} />
          <ul className="mx-(--card-spacing) flex flex-1 flex-col divide-y divide-border/60">
            {revenue.map((r) => (
              <li
                key={r.name}
                className="flex flex-1 flex-col justify-center gap-2 py-3.5 first:pt-0 last:pb-0"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  <span className="font-mono text-sm tabular-nums">{inr(r.paise)}</span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${(r.paise / totalRevenue) * 100}%` }}
                  />
                </span>
                <span className="flex justify-between text-xs text-muted-foreground">
                  <span>{r.bookings} bookings</span>
                  <span className="tabular-nums">
                    {Math.round((r.paise / totalRevenue) * 100)}% of revenue
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mx-(--card-spacing) flex items-baseline justify-between gap-3 border-t pt-3 text-sm">
            <span className="text-muted-foreground">All courts · {now.bookings} bookings</span>
            <span className="font-mono font-medium tabular-nums">{inr(now.earningsPaise)}</span>
          </div>
        </Widget>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Widget className="xl:col-span-2">
          <WidgetHeader title="Bookings by start hour" icon={ClockIcon} />
          <p className="-mt-2 px-(--card-spacing) text-sm text-muted-foreground">
            This period against the period before, hour by hour.
          </p>
          <div className="h-56 px-(--card-spacing)">
            <HourBars
              data={now.byHour.map((current, i) => ({
                label: hourName(FIRST_HOUR + i),
                current,
                previous: before.byHour[i] ?? 0,
              }))}
              currentLabel="This period"
              previousLabel="Period before"
              className="h-full"
            />
          </div>
        </Widget>

        <Widget>
          <WidgetHeader title="What players book" icon={ShuffleIcon} />
          <div className="flex flex-1 flex-col justify-between gap-5 px-(--card-spacing)">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                How they book
              </span>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="bg-primary"
                  style={{
                    width: `${list.length ? (online / list.length) * 100 : 0}%`,
                  }}
                />
                <span className="flex-1 bg-chart-2" />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-primary" />
                  Online {online}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-chart-2" />
                  Walk-in {list.length - online}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Booking length
              </span>
              <ul className="flex flex-col gap-2">
                {lengths.map((l) => (
                  <li
                    key={l.minutes}
                    className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-3 text-sm"
                  >
                    <span className="text-muted-foreground">{lengthLabel(l.minutes)}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-chart-2"
                        style={{
                          width: `${(l.count / Math.max(1, list.length)) * 100}%`,
                        }}
                      />
                    </span>
                    <span className="text-end font-mono text-xs tabular-nums">{l.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground">
              <ChartColumnIcon className="size-3.5" />
              {list.length} bookings played in this period
            </p>
          </div>
        </Widget>
      </div>
    </div>
  );
}
