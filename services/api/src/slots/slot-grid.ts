import type { BlockReason, GridCell, Slot } from "@yoorker/contracts";
import { addDays, quote, type PriceBook } from "../pricing/pricing";
import { isoWeekday, localToUtc } from "../schedule/local-time";
import { formatClock, startsForDay, type StoredWindow } from "../schedule/schedule-rules";

export interface CourtBlock {
  id: string;
  startsAt: Date;
  endsAt: Date;
  reason: BlockReason;
}

export interface CourtCalendar {
  timezone: string;
  startStepMinutes: number;
  windows: StoredWindow[];
  book: PriceBook;
  blocks: CourtBlock[];
}

function blockAt(calendar: CourtCalendar, startsAt: Date, endsAt: Date): CourtBlock | null {
  return (
    calendar.blocks.find(
      (b) => b.startsAt.getTime() < endsAt.getTime() && startsAt.getTime() < b.endsAt.getTime(),
    ) ?? null
  );
}

export function slotsForDay(
  calendar: CourtCalendar,
  date: string,
  minutes: number,
  packagePricePaise: number | null,
  now: Date,
): Slot[] {
  return startsForDay(calendar, date, minutes).map(({ startMinute, startsAt, endsAt }) => {
    const price = quote(calendar.book, { date, startMinute, minutes, packagePricePaise });
    const status = blockAt(calendar, startsAt, endsAt)
      ? "BLOCKED"
      : startsAt.getTime() < now.getTime()
        ? "PAST"
        : "FREE";
    return {
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      start: formatClock(startMinute),
      end: formatClock(startMinute + minutes),
      status,
      pricePaise: price?.pricePaise ?? null,
      ruleName: price?.ruleName ?? (price?.parts.length === 1 ? price.parts[0]!.ruleName : null),
    };
  });
}

export function gridForDay(calendar: CourtCalendar, date: string, now: Date): GridCell[] {
  const weekday = isoWeekday(date);
  const cells: GridCell[] = [];
  const windows = calendar.windows
    .filter((w) => w.weekday === weekday)
    .sort((a, b) => a.opensMinute - b.opensMinute);
  for (const w of windows) {
    for (let t = w.opensMinute; t < w.closesMinute; t += calendar.startStepMinutes) {
      const startsAt = localToUtc(date, t, calendar.timezone);
      const endsAt = localToUtc(
        date,
        Math.min(t + calendar.startStepMinutes, w.closesMinute),
        calendar.timezone,
      );
      const block = blockAt(calendar, startsAt, endsAt);
      cells.push({
        start: formatClock(t),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        status: block ? "BLOCKED" : startsAt.getTime() < now.getTime() ? "PAST" : "FREE",
        blockId: block?.id ?? null,
        blockReason: block?.reason ?? null,
      });
    }
  }
  return cells;
}

export function nextFree(
  calendar: CourtCalendar,
  today: string,
  minutes: number,
  packagePricePaise: number | null,
  now: Date,
  options: { count?: number; days?: number } = {},
): Slot[] {
  const found: Slot[] = [];
  const count = options.count ?? 3;
  for (let d = 0; d < (options.days ?? 7) && found.length < count; d++) {
    const date = addDays(today, d);
    for (const slot of slotsForDay(calendar, date, minutes, packagePricePaise, now)) {
      if (slot.status === "FREE" && slot.pricePaise !== null) found.push(slot);
      if (found.length === count) break;
    }
  }
  return found;
}
