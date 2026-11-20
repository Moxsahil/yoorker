import { CalendarCheckIcon, CalendarDaysIcon, ListIcon, PlusIcon } from "lucide-react";
import { parseAsBoolean, parseAsStringLiteral, useQueryState } from "nuqs";
import { useSearchParams } from "@/kit/framework";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/kit/ui-patterns/page-header";
import { Segmented } from "@/kit/ui-patterns/segmented";
import { StatusBadge } from "@/kit/ui-patterns/status-badge";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import { demoBookings } from "@/lib/demo-data";
import { useManualBookings } from "@/lib/manual-bookings";
import { useCurrentVenue } from "@/lib/session";
import { cn } from "@/lib/utils";
import { dayLabel, inr, lengthLabel, todayAt } from "@/lib/yoorker";

import { BOOKING, PAYMENT } from "./booking-labels";
import { BookingsCalendar } from "./bookings-calendar";
import { SampleBadge } from "./common";
import { NewBookingDialog } from "./new-booking";

type View = "today" | "upcoming" | "past";

const LAYOUTS = ["list", "calendar"] as const;
type Layout = (typeof LAYOUTS)[number];

/** Rows shown at first, and added by each "Show more". */
const PAGE = 40;

export function BookingsPage() {
  const { courts } = useCurrentVenue();
  const today = todayAt();
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const params = useSearchParams();
  const initial = params.get("view");
  const [view, setView] = useState<View>(
    initial === "upcoming" || initial === "past" ? initial : "today",
  );
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useQueryState(
    "layout",
    parseAsStringLiteral(LAYOUTS).withDefault("list"),
  );
  const [shown, setShown] = useState(PAGE);
  const manual = useManualBookings((state) => state.bookings);
  const all = useMemo(
    () => [
      ...demoBookings(
        today,
        courts.map((c) => c.name),
      ),
      ...manual,
    ],
    [courts, today, manual],
  );
  // ?new=1 opens the form, so the Overview's "New booking" button lands straight in it.
  const [creating, setCreating] = useQueryState("new", parseAsBoolean.withDefault(false));
  const rows = all
    .filter((b) =>
      view === "today"
        ? b.date === today
        : view === "upcoming"
          ? // Still to be played: later days, or later today. Same list as the Overview.
            b.booking === "CONFIRMED" && (b.date > today || (b.date === today && b.start >= clock))
          : b.date < today,
    )
    .filter(
      (b) =>
        !search ||
        `${b.customer} ${b.phone} ${b.phone.replace(/\s/g, "")} ${b.court} ${b.id}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      view === "past"
        ? `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`)
        : `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`),
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bookings"
        description="Every booking has two labels: what happened to the booking, and to the money."
        meta={<SampleBadge sprint="Sprint 3" />}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Stays in place in Calendar view, just inactive, so switching layout doesn't move anything. */}
            <div
              inert={layout === "calendar"}
              className={cn("transition-opacity", layout === "calendar" && "opacity-40")}
            >
              <Segmented<View>
                aria-label="Which bookings"
                className="w-auto shrink-0"
                value={view}
                onChange={(next) => {
                  setView(next);
                  setShown(PAGE);
                }}
                options={[
                  { value: "today", label: "Today" },
                  { value: "upcoming", label: "Upcoming" },
                  { value: "past", label: "Past" },
                ]}
              />
            </div>
            <Segmented<Layout>
              aria-label="Layout"
              className="w-auto shrink-0"
              value={layout}
              onChange={(next) => void setLayout(next === "list" ? null : next)}
              options={[
                { value: "list", label: "List", icon: ListIcon },
                {
                  value: "calendar",
                  label: "Calendar",
                  icon: CalendarDaysIcon,
                },
              ]}
            />
            <Button onClick={() => void setCreating(true)}>
              <PlusIcon data-icon="inline-start" />
              New booking
            </Button>
          </div>
        }
      />
      <NewBookingDialog
        open={creating}
        onOpenChange={(next) => void setCreating(next || null)}
        courts={courts}
        existing={all}
      />
      {layout === "calendar" ? (
        <BookingsCalendar
          bookings={all}
          courts={courts.length ? courts.map((c) => c.name) : [...new Set(all.map((b) => b.court))]}
          today={today}
        />
      ) : (
        <Widget>
          <WidgetHeader
            title={`${rows.length} ${rows.length === 1 ? "booking" : "bookings"}`}
            icon={CalendarCheckIcon}
            action={
              <Input
                placeholder="Search name, phone, court or ID"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShown(PAGE);
                }}
                // The header pulls its action out to the edge; push the field back inside the card.
                className="me-2 h-8 w-64 max-w-[50vw]"
              />
            }
          />
          <div className="overflow-x-auto px-[calc(var(--card-spacing)-0.75rem)]">
            <Table className="min-w-[60rem] table-fixed [&_td]:px-3 [&_td]:py-3 [&_td:first-child]:rounded-s-lg [&_td:last-child]:rounded-e-lg [&_th]:h-9 [&_th]:px-3">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[17%]">Customer</TableHead>
                  <TableHead className="hidden w-[14%] md:table-cell">Contact</TableHead>
                  <TableHead className="w-[12%]">Court</TableHead>
                  <TableHead className="w-[13%]">Date &amp; time</TableHead>
                  <TableHead className="w-[11%]">Booking</TableHead>
                  <TableHead className="w-[11%]">Payment</TableHead>
                  <TableHead className="hidden w-[10%] md:table-cell">Source</TableHead>
                  <TableHead className="w-[12%] text-end">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, shown).map((b) => (
                  <TableRow key={b.id} className="border-border/60 hover:bg-muted/40">
                    <TableCell>
                      <span className="block truncate font-medium">{b.customer}</span>
                      <span className="font-mono text-xs text-muted-foreground">{b.id}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <a
                        href={`tel:${b.phone.replace(/\s/g, "")}`}
                        className="font-mono text-sm whitespace-nowrap tabular-nums hover:text-primary hover:underline"
                      >
                        {b.phone}
                      </a>
                    </TableCell>
                    <TableCell>{b.court}</TableCell>
                    <TableCell>
                      <span className="block">{b.date === today ? "Today" : dayLabel(b.date)}</span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {b.start} · {lengthLabel(b.minutes)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={BOOKING[b.booking].tone}>
                        {BOOKING[b.booking].label}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={PAYMENT[b.payment].tone}>
                        {PAYMENT[b.payment].label}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {b.source === "WALK_IN" ? "Walk-in" : "Online"}
                    </TableCell>
                    <TableCell className="text-end font-mono tabular-nums">
                      {inr(b.pricePaise)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {rows.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-(--card-spacing) text-sm text-muted-foreground">
              <span>
                Showing{" "}
                <span className="text-foreground tabular-nums">{Math.min(shown, rows.length)}</span>{" "}
                of <span className="text-foreground tabular-nums">{rows.length}</span>
              </span>
              {shown < rows.length && (
                <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                  Show {Math.min(PAGE, rows.length - shown)} more
                </Button>
              )}
            </div>
          )}
        </Widget>
      )}
    </div>
  );
}
