import type {
  CourtDuration,
  CourtSchedule,
  DaySchedule,
  UpdateCourtSchedule,
} from "@yoorker/contracts";
import { isoWeekday, localToUtc } from "./local-time";

const DAY = 1440;
const WEEK = 7 * DAY;

/** An opening window as stored: minutes after local midnight; closes may pass 1440. */
export interface StoredWindow {
  weekday: number;
  opensMinute: number;
  closesMinute: number;
}

export interface ScheduleIssue {
  path: string;
  message: string;
}

/** "06:30" -> 390 */
export function parseClock(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

/** 390 -> "06:30"; 1560 (02:00 the next day) -> "02:00" */
export function formatClock(minute: number): string {
  const m = minute % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 210 -> "3 h 30 m", 60 -> "1 h", 30 -> "30 m" */
export function describeMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h > 0 ? `${h} h` : "", m > 0 ? `${m} m` : ""].filter(Boolean).join(" ");
}

function toStored(weekday: number, opens: string, closes: string): StoredWindow {
  const opensMinute = parseClock(opens);
  let closesMinute = parseClock(closes);
  // At or before opening time: the window ends the next day (00:00-00:00 is 24 hours).
  if (closesMinute <= opensMinute) closesMinute += DAY;
  return { weekday, opensMinute, closesMinute };
}

/** The window's span in minutes from Monday 00:00, split in two if it runs past Sunday night. */
function weekRanges(w: StoredWindow): [number, number][] {
  const start = (w.weekday - 1) * DAY + w.opensMinute;
  const end = (w.weekday - 1) * DAY + w.closesMinute;
  return end <= WEEK
    ? [[start, end]]
    : [
        [start, WEEK],
        [0, end - WEEK],
      ];
}

function overlaps(a: StoredWindow, b: StoredWindow): boolean {
  return weekRanges(a).some(([s1, e1]) => weekRanges(b).some(([s2, e2]) => s1 < e2 && s2 < e1));
}

/**
 * Checks a schedule against the rules the request schema can't see on its own, and turns it
 * into stored windows. `courtSports` are the sports the court offers.
 */
export function checkSchedule(
  input: UpdateCourtSchedule,
  courtSports: readonly string[],
): { windows: StoredWindow[]; issues: ScheduleIssue[] } {
  const issues: ScheduleIssue[] = [];
  const step = input.startStepMinutes;

  const windows: StoredWindow[] = [];
  const paths: string[] = [];
  if (input.alwaysOpen) {
    for (let weekday = 1; weekday <= 7; weekday++) {
      windows.push({ weekday, opensMinute: 0, closesMinute: DAY });
      paths.push("alwaysOpen");
    }
  } else {
    const seen = new Set<number>();
    input.days!.forEach((day, d) => {
      if (seen.has(day.weekday)) {
        issues.push({ path: `days.${d}.weekday`, message: "Each weekday can appear only once" });
      }
      seen.add(day.weekday);
      day.windows.forEach((w, i) => {
        windows.push(toStored(day.weekday, w.opens, w.closes));
        paths.push(`days.${d}.windows.${i}`);
      });
    });
  }

  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      if (overlaps(windows[i]!, windows[j]!)) {
        issues.push({ path: paths[j]!, message: "Opening hours overlap another window" });
      }
    }
  }

  const longestWindow = Math.max(0, ...windows.map((w) => w.closesMinute - w.opensMinute));
  const seenDurations = new Set<string>();
  input.durations.forEach((d, i) => {
    const path = `durations.${i}`;
    if (d.minutes % step !== 0) {
      issues.push({
        path: `${path}.minutes`,
        message: `${describeMinutes(d.minutes)} must be a whole number of ${step}-minute steps`,
      });
    }
    if (d.sport !== null && !courtSports.includes(d.sport)) {
      issues.push({ path: `${path}.sport`, message: `This court doesn't offer ${d.sport}` });
    }
    const key = `${d.sport ?? ""}:${d.minutes}`;
    if (seenDurations.has(key)) {
      issues.push({ path, message: "This booking length is listed twice" });
    }
    seenDurations.add(key);
    if (windows.length > 0 && d.minutes > longestWindow) {
      issues.push({
        path: `${path}.minutes`,
        message: `${describeMinutes(d.minutes)} doesn't fit in any opening window`,
      });
    }
  });

  return { windows, issues };
}

/** The API shape: all seven days, Monday first, with local HH:MM times. */
export function toCourtSchedule(args: {
  courtId: string;
  timezone: string;
  startStepMinutes: number;
  windows: StoredWindow[];
  durations: CourtDuration[];
}): CourtSchedule {
  const days: DaySchedule[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    windows: args.windows
      .filter((w) => w.weekday === weekday)
      .sort((a, b) => a.opensMinute - b.opensMinute)
      .map((w) => ({ opens: formatClock(w.opensMinute), closes: formatClock(w.closesMinute) })),
  }));
  const alwaysOpen =
    args.windows.length === 7 &&
    args.windows.every((w) => w.opensMinute === 0 && w.closesMinute === DAY);
  return {
    courtId: args.courtId,
    timezone: args.timezone,
    startStepMinutes: args.startStepMinutes,
    durations: args.durations,
    alwaysOpen,
    days,
  };
}

export interface SlotTime {
  /** Minutes after local midnight of the date asked for; past 1440 after midnight. */
  startMinute: number;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Every booking of `minutes` that can start on local `date`: from each window's opening time,
 * every start step, as long as the booking ends by closing time. A window that runs past
 * midnight belongs to the day it opened. The slot grid (TURF-204) builds on this.
 */
export function startsForDay(
  schedule: { startStepMinutes: number; windows: StoredWindow[]; timezone: string },
  date: string,
  minutes: number,
): SlotTime[] {
  const weekday = isoWeekday(date);
  const starts: SlotTime[] = [];
  const windows = schedule.windows
    .filter((w) => w.weekday === weekday)
    .sort((a, b) => a.opensMinute - b.opensMinute);
  for (const w of windows) {
    for (let t = w.opensMinute; t + minutes <= w.closesMinute; t += schedule.startStepMinutes) {
      starts.push({
        startMinute: t,
        startsAt: localToUtc(date, t, schedule.timezone),
        endsAt: localToUtc(date, t + minutes, schedule.timezone),
      });
    }
  }
  return starts;
}
