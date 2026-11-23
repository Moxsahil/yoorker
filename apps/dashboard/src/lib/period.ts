export const PERIODS = ["today", "7d", "30d", "custom"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABEL: Record<Period, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  custom: "Custom",
};

export const MAX_CUSTOM_DAYS = 92;

export interface DateRange {
  from: string;
  to: string;
  days: number;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return (
    Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1
  );
}

export function datesIn(range: DateRange): string[] {
  return Array.from({ length: range.days }, (_, i) => addDays(range.from, i));
}

export function resolvePeriod(
  period: Period,
  today: string,
  custom?: { from: string; to: string },
): DateRange {
  if (period === "today") return { from: today, to: today, days: 1 };
  if (period === "7d") return { from: addDays(today, -6), to: today, days: 7 };
  if (period === "30d") return { from: addDays(today, -29), to: today, days: 30 };
  const to = custom && custom.to <= today ? custom.to : today;
  const from = custom && custom.from <= to ? custom.from : addDays(to, -6);
  const days = Math.min(daysBetween(from, to), MAX_CUSTOM_DAYS);
  return { from: addDays(to, -(days - 1)), to, days };
}

export function previousOf(range: DateRange): DateRange {
  return {
    from: addDays(range.from, -range.days),
    to: addDays(range.from, -1),
    days: range.days,
  };
}

const fmt = (date: string, withYear = false) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });

export function rangeLabel(range: DateRange): string {
  if (range.days === 1) {
    return new Date(`${range.from}T12:00:00Z`).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  }
  const sameMonth = range.from.slice(0, 7) === range.to.slice(0, 7);
  return sameMonth
    ? `${Number(range.from.slice(8))}–${fmt(range.to)}`
    : `${fmt(range.from)} – ${fmt(range.to)}`;
}
