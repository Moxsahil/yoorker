/** Converts local wall-clock times to UTC instants for an IANA timezone (Asia/Kolkata). */

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses "2026-12-19" into its parts, or throws for anything that is not a real date. */
export function parseDate(date: string): { year: number; month: number; day: number } {
  const match = DATE.exec(date);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCMonth() === month - 1 && check.getUTCDate() === day) {
      return { year, month, day };
    }
  }
  throw new RangeError(`Not a date: ${date}`);
}

/** ISO weekday of a calendar date: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: string): number {
  const { year, month, day } = parseDate(date);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** How far the timezone's wall clock is ahead of UTC at `instant`, in milliseconds. */
function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return wall - Math.floor(instant / 1000) * 1000;
}

/**
 * The UTC instant of `minuteOfDay` minutes after local midnight on `date` in `timeZone`.
 * Minutes past 1440 fall on the next day (a window that closes at 02:00).
 */
export function localToUtc(date: string, minuteOfDay: number, timeZone: string): Date {
  const { year, month, day } = parseDate(date);
  const wall = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  const first = offsetMs(wall - offsetMs(wall, timeZone), timeZone);
  return new Date(wall - first);
}

/** The venue's local "YYYY-MM-DDTHH:MM" for a UTC instant. */
export function utcToLocal(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** The UTC instant of a local "YYYY-MM-DDTHH:MM" at the venue. */
export function localDateTimeToUtc(local: string, timeZone: string): Date {
  const [hours, minutes] = local.slice(11).split(":").map(Number);
  return localToUtc(local.slice(0, 10), hours! * 60 + minutes!, timeZone);
}
