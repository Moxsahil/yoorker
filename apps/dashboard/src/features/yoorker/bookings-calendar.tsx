import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, PhoneIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/kit/ui-patterns/segmented";
import { StatusBadge } from "@/kit/ui-patterns/status-badge";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import type { BookingLabel, DemoBooking } from "@/lib/demo-data";
import { addDays } from "@/lib/period";
import { cn } from "@/lib/utils";
import { dayLabel, inr, lengthLabel } from "@/lib/yoorker";

import { BOOKING, PAYMENT } from "./booking-labels";

type Mode = "week" | "day";

/** The grid runs from 06:00 to 01:00, so a 21:00 cricket slot fits in full. */
const START_HOUR = 6;
const END_HOUR = 25;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

/**
 * Fills are mixed with the card colour rather than see-through, so the hour lines and the
 * "now" line never show through a booking's text.
 */
const BLOCK: Record<BookingLabel, string> = {
  CONFIRMED:
    "border-primary/45 bg-[color-mix(in_oklch,var(--color-primary)_15%,var(--color-card))] hover:bg-[color-mix(in_oklch,var(--color-primary)_25%,var(--color-card))]",
  COMPLETED:
    "border-success/45 bg-[color-mix(in_oklch,var(--color-success)_12%,var(--color-card))] hover:bg-[color-mix(in_oklch,var(--color-success)_20%,var(--color-card))]",
  CANCELLED: "border-dashed border-muted-foreground/40 bg-muted text-muted-foreground line-through",
  NO_SHOW:
    "border-destructive/45 bg-[color-mix(in_oklch,var(--color-destructive)_12%,var(--color-card))] hover:bg-[color-mix(in_oklch,var(--color-destructive)_20%,var(--color-card))]",
};

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

const endOf = (b: DemoBooking) => {
  const end = minutesOf(b.start) + b.minutes;
  return `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
};

const hourLabel = (hour: number) => {
  const h = hour % 24;
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
};

/** "Turf 1" → "T1", "Cricket ground" → "CG": fits above a narrow lane. */
const shortName = (court: string) =>
  court
    .split(/\s+/)
    .map((word) => (/^\d+$/.test(word) ? word : word[0]!.toUpperCase()))
    .join("");

const mondayOf = (date: string) =>
  addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));

const fmt = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", {
    ...opts,
    timeZone: "UTC",
  });

function useIstMinutes() {
  const read = () => {
    const [h, m] = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date())
      .split(":")
      .map(Number);
    return h! * 60 + m!;
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setNow(read()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function BookingBlock({
  booking,
  hourPx,
  lane,
  lanes,
  compact,
}: {
  booking: DemoBooking;
  hourPx: number;
  lane: number;
  lanes: number;
  compact: boolean;
}) {
  const start = minutesOf(booking.start);
  const visible = Math.min(booking.minutes, END_HOUR * 60 - start);
  const unpaid = booking.payment === "NOT_PAID";
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "absolute z-[1] flex flex-col overflow-hidden rounded-md border px-1.5 py-1 text-start text-xs leading-tight transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              BLOCK[booking.booking],
            )}
            style={{
              top: ((start - START_HOUR * 60) / 60) * hourPx + 1,
              height: (visible / 60) * hourPx - 2,
              left: `calc(${(lane / lanes) * 100}% + 2px)`,
              width: `calc(${100 / lanes}% - 4px)`,
            }}
          />
        }
      >
        {unpaid && (
          <span
            className="absolute end-1 top-1 size-1.5 rounded-full bg-warning"
            aria-label="Not paid"
          />
        )}
        <span className="truncate pe-2 font-mono text-[10px] text-muted-foreground tabular-nums">
          {booking.start}
        </span>
        <span className="truncate font-medium">
          {compact ? booking.customer.split(" ")[0] : booking.customer}
        </span>
        {!compact && (
          <span className="mt-0.5 truncate text-muted-foreground">
            {booking.start}–{endOf(booking)} · {lengthLabel(booking.minutes)}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{booking.customer}</span>
          <span className="font-mono text-xs text-muted-foreground">{booking.id}</span>
        </div>
        <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Court</dt>
          <dd>{booking.court}</dd>
          <dt className="text-muted-foreground">Date</dt>
          <dd>{dayLabel(booking.date)}</dd>
          <dt className="text-muted-foreground">Time</dt>
          <dd className="font-mono tabular-nums">
            {booking.start}–{endOf(booking)}{" "}
            <span className="font-sans text-muted-foreground">
              · {lengthLabel(booking.minutes)}
            </span>
          </dd>
          <dt className="text-muted-foreground">Contact</dt>
          <dd>
            <a
              href={`tel:${booking.phone.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-1.5 font-mono tabular-nums hover:text-primary hover:underline"
            >
              <PhoneIcon className="size-3.5" />
              {booking.phone}
            </a>
          </dd>
          <dt className="text-muted-foreground">Source</dt>
          <dd>{booking.source === "WALK_IN" ? "Walk-in" : "Online"}</dd>
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="font-mono tabular-nums">{inr(booking.pricePaise)}</dd>
        </dl>
        <div className="flex gap-2 border-t pt-3">
          <StatusBadge tone={BOOKING[booking.booking].tone}>
            {BOOKING[booking.booking].label}
          </StatusBadge>
          <StatusBadge tone={PAYMENT[booking.payment].tone}>
            {PAYMENT[booking.payment].label}
          </StatusBadge>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Week or day timeline of bookings. In a week each day splits into one lane per court. */
export function BookingsCalendar({
  bookings,
  courts,
  today,
}: {
  bookings: DemoBooking[];
  courts: string[];
  today: string;
}) {
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(today);
  const now = useIstMinutes();
  const scroller = useRef<HTMLDivElement>(null);

  // Open on the afternoon, where most bookings are, not on 06:00.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 9 * (mode === "week" ? 48 : 64);
  }, [mode]);

  const hourPx = mode === "week" ? 48 : 64;
  const days =
    mode === "week" ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i)) : [anchor];
  const step = mode === "week" ? 7 : 1;
  const title =
    mode === "week"
      ? `${fmt(days[0]!, { day: "numeric", month: "short" })} – ${fmt(days[6]!, { day: "numeric", month: "short", year: "numeric" })}`
      : fmt(anchor, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        });
  const byDay = (date: string) => bookings.filter((b) => b.date === date);
  const count = bookings.filter((b) => days.includes(b.date)).length;
  const nowTop = now >= START_HOUR * 60 ? ((now - START_HOUR * 60) / 60) * hourPx : null;

  // Day view: one column per court. Week view: one column per day.
  const columns =
    mode === "week"
      ? days.map((date) => ({ key: date, date, court: undefined }))
      : courts.map((court) => ({ key: court, date: anchor, court }));

  return (
    <Widget>
      <WidgetHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {title}
            <span className="text-sm font-normal text-muted-foreground">· {count} bookings</span>
          </span>
        }
        icon={CalendarDaysIcon}
        action={
          <div className="me-2 flex flex-wrap items-center gap-2">
            <Segmented<Mode>
              aria-label="Calendar range"
              className="w-auto shrink-0"
              value={mode}
              onChange={setMode}
              options={[
                { value: "week", label: "Week" },
                { value: "day", label: "Day" },
              ]}
            />
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={mode === "week" ? "Previous week" : "Previous day"}
                onClick={() => setAnchor((d) => addDays(d, -step))}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAnchor(today)}
                disabled={days.includes(today)}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={mode === "week" ? "Next week" : "Next day"}
                onClick={() => setAnchor((d) => addDays(d, step))}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-(--card-spacing) text-xs text-muted-foreground">
        {(Object.keys(BLOCK) as BookingLabel[]).map((label) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded-[3px] border", BLOCK[label].split(" hover:")[0])} />
            {BOOKING[label].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-warning" />
          Not paid
        </span>
        {mode === "week" && (
          <span className="ms-auto">
            Lanes in each day: {courts.map((c) => `${shortName(c)} ${c}`).join(" · ")}
          </span>
        )}
      </div>

      <div className="px-(--card-spacing)">
        <div ref={scroller} className="max-h-[640px] overflow-auto rounded-lg border">
          <div
            className="grid min-w-[52rem]"
            style={{
              gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(0, 1fr))`,
            }}
          >
            {/* Header row, stuck to the top while the hours scroll. */}
            <div className="sticky top-0 left-0 z-30 border-e border-b bg-card" />
            {columns.map((col) => {
              const isToday = col.date === today;
              return (
                <div
                  key={col.key}
                  className="sticky top-0 z-20 flex flex-col gap-1 border-b bg-card px-2 py-2 not-last:border-e"
                >
                  {col.court ? (
                    <span className="text-sm font-medium">{col.court}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAnchor(col.date);
                        setMode("day");
                      }}
                      className="flex items-baseline gap-1.5 rounded text-start hover:text-primary"
                      title="Open this day"
                    >
                      <span className="text-xs text-muted-foreground uppercase">
                        {fmt(col.date, { weekday: "short" })}
                      </span>
                      <span
                        className={cn(
                          "flex size-7 items-center justify-center rounded-full font-mono text-sm font-semibold tabular-nums",
                          isToday && "bg-primary text-primary-foreground",
                        )}
                      >
                        {fmt(col.date, { day: "numeric" })}
                      </span>
                    </button>
                  )}
                  {!col.court && (
                    <span
                      className="grid text-[10px] text-muted-foreground"
                      style={{
                        gridTemplateColumns: `repeat(${courts.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {courts.map((c) => (
                        <span key={c} className="truncate text-center">
                          {shortName(c)}
                        </span>
                      ))}
                    </span>
                  )}
                  {col.court && (
                    <span className="text-xs text-muted-foreground">
                      {byDay(col.date).filter((b) => b.court === col.court).length} bookings
                    </span>
                  )}
                </div>
              );
            })}

            {/* Hour labels. */}
            <div className="sticky left-0 z-10 border-e bg-card">
              {/* The time now, in the hour column, where no booking can cover it. */}
              {days.includes(today) && nowTop !== null && (
                <span
                  className="absolute end-1 z-10 -translate-y-1/2 rounded bg-destructive px-1 py-px font-mono text-[10px] text-white tabular-nums"
                  style={{ top: nowTop }}
                >
                  {String(Math.floor(now / 60)).padStart(2, "0")}:
                  {String(now % 60).padStart(2, "0")}
                </span>
              )}
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="relative border-t border-border/50 first:border-t-0"
                  style={{ height: hourPx }}
                >
                  {/* Sits just under its hour line, so the line never runs through the text. */}
                  <span className="absolute top-1 end-2 font-mono text-[10px] text-muted-foreground tabular-nums">
                    {hourLabel(hour)}
                  </span>
                </div>
              ))}
            </div>

            {columns.map((col) => {
              const list = byDay(col.date).filter((b) => !col.court || b.court === col.court);
              const isToday = col.date === today;
              return (
                <div
                  key={col.key}
                  className={cn(
                    "relative not-last:border-e",
                    isToday && mode === "week" && "bg-primary/[0.03]",
                  )}
                >
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="border-t border-border/50 first:border-t-0"
                      style={{ height: hourPx }}
                    />
                  ))}
                  {list.map((b) => (
                    <BookingBlock
                      key={b.id}
                      booking={b}
                      hourPx={hourPx}
                      lane={col.court ? 0 : Math.max(0, courts.indexOf(b.court))}
                      lanes={col.court ? 1 : Math.max(1, courts.length)}
                      compact={!col.court}
                    />
                  ))}
                  {isToday && nowTop !== null && (
                    <span
                      className="pointer-events-none absolute inset-x-0 z-0 h-px bg-destructive"
                      style={{ top: nowTop }}
                      aria-hidden
                    ></span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Widget>
  );
}
