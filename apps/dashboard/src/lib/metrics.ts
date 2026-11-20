import type { DemoBooking } from "./demo-data";
import { addDays, datesIn, type DateRange } from "./period";

export interface Bucket {
  label: string;
  title: string;
  value: number;
}

export interface PeriodMetrics {
  bookings: number;
  earningsPaise: number;
  notPaidPaise: number;
  refundedPaise: number;
  avgBookingPaise: number;
  noShows: number;
  cancelled: number;
  occupancy: number;
  newCustomers: number;
  walkIns: number;
  byCourt: Record<string, number>;
  /** Paid revenue per court. */
  byCourtRevenue: Record<string, number>;
  /** Booked minutes per court. */
  byCourtMinutes: Record<string, number>;
  /** Different people who played in the period. */
  customers: number;
  /** Bookings starting in each hour, 06:00 to 23:00. */
  byHour: number[];
  earningsSeries: Bucket[];
  bookingsSeries: Bucket[];
  occupancySeries: Bucket[];
  newCustomerSeries: Bucket[];
}

export const FIRST_HOUR = 6;
export const HOURS = 18;

const dateFmt = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", {
    ...opts,
    timeZone: "UTC",
  });

/** Buckets for a range: hours for one day, days up to a month, weeks beyond. */
function bucketsFor(
  range: DateRange,
): { label: string; title: string; dates: string[]; hour?: number }[] {
  if (range.days === 1) {
    return Array.from({ length: HOURS }, (_, i) => {
      const hour = FIRST_HOUR + i;
      const label = `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`;
      return {
        label,
        title: `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`,
        dates: [range.from],
        hour,
      };
    });
  }
  const dates = datesIn(range);
  if (range.days <= 31) {
    return dates.map((date) => ({
      label:
        range.days <= 7 ? dateFmt(date, { weekday: "short" }) : dateFmt(date, { day: "numeric" }),
      title: dateFmt(date, {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
      dates: [date],
    }));
  }
  // Whole weeks counted back from the last day, so the latest bar is a full week; only the
  // first one may be short.
  const weeks: { label: string; title: string; dates: string[] }[] = [];
  for (let end = dates.length; end > 0; end -= 7) {
    const chunk = dates.slice(Math.max(0, end - 7), end);
    weeks.unshift({
      label: dateFmt(chunk[0]!, { day: "numeric", month: "short" }),
      title: `Week of ${dateFmt(chunk[0]!, { day: "numeric", month: "short" })}`,
      dates: chunk,
    });
  }
  return weeks;
}

const startHour = (b: DemoBooking) => Number(b.start.slice(0, 2));

/**
 * Everything the Overview shows for one period. `openMinutes(date)` is how long all courts are
 * open that day (from the real schedules), so occupancy = booked time / open time.
 */
export function periodMetrics(
  all: DemoBooking[],
  range: DateRange,
  today: string,
  openMinutes: (date: string) => number,
): PeriodMetrics {
  const inRange = all.filter((b) => b.date >= range.from && b.date <= range.to && b.date <= today);
  const played = inRange.filter((b) => b.booking !== "CANCELLED");
  const paid = inRange.filter((b) => b.payment === "PAID");
  const sum = (list: DemoBooking[]) => list.reduce((s, b) => s + b.pricePaise, 0);

  // A customer is new in the period if their first ever booking falls inside it.
  const first = new Map<string, string>();
  for (const b of all) {
    if (b.booking === "CANCELLED" || b.date > today) continue;
    const seen = first.get(b.customer);
    if (!seen || b.date < seen) first.set(b.customer, b.date);
  }
  const newOn = (dates: string[]) => [...first.values()].filter((d) => dates.includes(d)).length;

  const openIn = (dates: string[]) => dates.reduce((s, d) => s + openMinutes(d), 0);
  const bookedIn = (list: DemoBooking[]) => list.reduce((s, b) => s + b.minutes, 0);
  const dates = datesIn(range).filter((d) => d <= today);

  const byCourt: Record<string, number> = {};
  const byCourtRevenue: Record<string, number> = {};
  const byCourtMinutes: Record<string, number> = {};
  for (const b of played) {
    byCourt[b.court] = (byCourt[b.court] ?? 0) + 1;
    byCourtMinutes[b.court] = (byCourtMinutes[b.court] ?? 0) + b.minutes;
  }
  for (const b of paid) byCourtRevenue[b.court] = (byCourtRevenue[b.court] ?? 0) + b.pricePaise;
  const byHour = Array.from(
    { length: HOURS },
    (_, i) => played.filter((b) => startHour(b) === FIRST_HOUR + i).length,
  );

  const buckets = bucketsFor(range);
  const pick = (bucket: { dates: string[]; hour?: number }, list: DemoBooking[]) =>
    list.filter(
      (b) =>
        bucket.dates.includes(b.date) &&
        (bucket.hour === undefined || startHour(b) === bucket.hour),
    );

  return {
    bookings: played.length,
    earningsPaise: sum(paid),
    notPaidPaise: sum(inRange.filter((b) => b.payment === "NOT_PAID")),
    refundedPaise: sum(inRange.filter((b) => b.payment === "REFUNDED")),
    avgBookingPaise: paid.length ? Math.round(sum(paid) / paid.length) : 0,
    noShows: inRange.filter((b) => b.booking === "NO_SHOW").length,
    cancelled: inRange.filter((b) => b.booking === "CANCELLED").length,
    walkIns: played.filter((b) => b.source === "WALK_IN").length,
    occupancy: openIn(dates) ? Math.min(1, bookedIn(played) / openIn(dates)) : 0,
    newCustomers: newOn(dates),
    byCourt,
    byCourtRevenue,
    byCourtMinutes,
    customers: new Set(played.map((b) => b.customer)).size,
    byHour,
    earningsSeries: buckets.map((bucket) => ({
      label: bucket.label,
      title: bucket.title,
      value: sum(pick(bucket, paid)),
    })),
    bookingsSeries: buckets.map((bucket) => ({
      label: bucket.label,
      title: bucket.title,
      value: pick(bucket, played).length,
    })),
    occupancySeries:
      range.days === 1
        ? []
        : buckets.map((bucket) => {
            const open = openIn(bucket.dates.filter((d) => d <= today));
            return {
              label: bucket.label,
              title: bucket.title,
              value: open ? Math.round((bookedIn(pick(bucket, played)) / open) * 100) : 0,
            };
          }),
    newCustomerSeries: buckets.map((bucket) => ({
      label: bucket.label,
      title: bucket.title,
      value: bucket.hour === undefined ? newOn(bucket.dates.filter((d) => d <= today)) : 0,
    })),
  };
}

/** Ratio change, or null when there's nothing to compare with. */
export function delta(now: number, before: number): number | null {
  if (!before) return null;
  return (now - before) / before;
}

export { addDays };
