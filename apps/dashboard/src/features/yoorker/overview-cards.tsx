import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  BanIcon,
  Building2Icon,
  CalendarCheckIcon,
  CalendarClockIcon,
  Clock3Icon,
  HistoryIcon,
  IndianRupeeIcon,
  LandPlotIcon,
  ShieldOffIcon,
  TagIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

import { Link } from "@/kit/framework";
import { PillBars } from "@/components/yoorker/charts";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPercent } from "@/kit/data/format";
import { StatusBadge } from "@/kit/ui-patterns/status-badge";
import { Delta, Widget, WidgetHeader } from "@/kit/widgets/widget";
import { api } from "@/lib/api";
import type { DemoBooking } from "@/lib/demo-data";
import { delta, type PeriodMetrics } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import {
  dayLabel,
  inr,
  inrCompact,
  lengthLabel,
  REASON_LABEL,
  type BlockReason,
  type Court,
} from "@/lib/yoorker";
import { DEV_NOTES } from "@/lib/dev-notes";

import { LiveBadge, SampleBadge } from "./common";

export interface Stat {
  label: string;
  value: string;
  icon: LucideIcon;
  delta: number | null;
  invert?: boolean;
  caption: string;
}

export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{stat.label}</span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
              <stat.icon className="size-4" />
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
              {stat.value}
            </span>
            <Delta value={stat.delta} invert={stat.invert} className="text-xs" />
          </div>
          <span className="truncate text-xs text-muted-foreground">{stat.caption}</span>
        </div>
      ))}
    </div>
  );
}

export function RevenueCard({
  now,
  before,
  vs,
  chartKey,
  days,
}: {
  now: PeriodMetrics;
  before: PeriodMetrics;
  vs: string;
  chartKey: string;
  days: number;
}) {
  return (
    <Widget className="xl:col-span-2">
      <WidgetHeader
        title={<CardTitle title="Revenue overview" badge={<SampleBadge sprint="Sprint 5" />} />}
        icon={IndianRupeeIcon}
      />
      <div className="flex flex-wrap items-end justify-between gap-4 px-(--card-spacing)">
        <div className="flex flex-col gap-1">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
              {inr(now.earningsPaise)}
            </span>
            <Delta value={delta(now.earningsPaise, before.earningsPaise)} className="text-xs" />
          </span>
          <span className="text-xs text-muted-foreground">
            collected · vs {inr(before.earningsPaise)} {vs}
          </span>
        </div>
        <dl className="flex gap-6 text-sm">
          {[
            { label: "Paid", value: now.earningsPaise, dot: "bg-chart-lead" },
            { label: "To collect", value: now.notPaidPaise, dot: "bg-warning" },
            {
              label: "Refunded",
              value: now.refundedPaise,
              dot: "bg-destructive",
            },
          ].map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("size-2 rounded-full", row.dot)} />
                {row.label}
              </dt>
              <dd className="font-mono tabular-nums">{inrCompact(row.value)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="h-64 px-(--card-spacing) pb-(--card-spacing)">
        <PillBars
          key={chartKey}
          data={now.earningsSeries}
          highlight={days === 1 ? "max" : "last"}
          format={inrCompact}
          className="h-full"
          barSize={days > 20 && days <= 31 ? 12 : 22}
        />
      </div>
    </Widget>
  );
}

export function UpcomingBookings({ bookings, today }: { bookings: DemoBooking[]; today: string }) {
  return (
    <Widget>
      <WidgetHeader
        title={<CardTitle title="Upcoming bookings" badge={<SampleBadge sprint="Sprint 3" />} />}
        icon={CalendarClockIcon}
        action={
          <Link
            href="/bookings?view=upcoming"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            View all
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        }
      />
      {bookings.length === 0 ? (
        <p className="px-(--card-spacing) text-sm text-muted-foreground">No upcoming bookings.</p>
      ) : (
        <ul className="mx-(--card-spacing) divide-y divide-border/60">
          {bookings.map((b) => {
            const [h, m] = b.start.split(":").map(Number);
            const endMinute = h! * 60 + m! + b.minutes;
            const end = `${String(Math.floor(endMinute / 60) % 24).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`;
            const [weekday, day] = dayLabel(b.date).replace(",", "").split(" ");
            const isToday = b.date === today;
            return (
              <li
                key={b.id}
                className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-4 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="flex h-12 flex-col items-center justify-center rounded-lg bg-muted leading-tight">
                  <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    {isToday ? "Today" : weekday}
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {isToday ? b.start : day}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-sm font-medium">{b.customer}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{b.court}</span>
                    <span aria-hidden>·</span>
                    <span className="font-mono tabular-nums">
                      {b.start}–{end}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{lengthLabel(b.minutes)}</span>
                  </span>
                </div>
                <div className="flex w-20 flex-col items-end gap-1.5">
                  <StatusBadge tone={b.payment === "PAID" ? "success" : "warning"}>
                    {b.payment === "PAID" ? "Paid" : "Not paid"}
                  </StatusBadge>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {inr(b.pricePaise)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Widget>
  );
}

export function VenuePerformance({
  courts,
  now,
  before,
  openMinutes,
}: {
  courts: Court[];
  now: PeriodMetrics;
  before: PeriodMetrics;
  openMinutes: (court: Court) => number;
}) {
  const rows = courts.map((court) => {
    const open = openMinutes(court);
    return {
      court,
      bookings: now.byCourt[court.name] ?? 0,
      bookingsBefore: before.byCourt[court.name] ?? 0,
      revenue: now.byCourtRevenue[court.name] ?? 0,
      occupancy: open ? Math.min(1, (now.byCourtMinutes[court.name] ?? 0) / open) : 0,
    };
  });
  const best = Math.max(1, ...rows.map((r) => r.revenue));
  const totalOpen = courts.reduce((sum, c) => sum + openMinutes(c), 0);
  const totalBooked = courts.reduce((sum, c) => sum + (now.byCourtMinutes[c.name] ?? 0), 0);
  return (
    <Widget className="xl:col-span-2">
      <WidgetHeader
        title={<CardTitle title="Venue performance" badge={<SampleBadge sprint="Sprint 3" />} />}
        icon={Building2Icon}
      />
      <div className="overflow-x-auto px-[calc(var(--card-spacing)-0.75rem)]">
        <Table className="[&_td]:px-3 [&_td]:py-3.5 [&_td:first-child]:rounded-s-lg [&_td:last-child]:rounded-e-lg [&_th]:h-9 [&_th]:px-3">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Court</TableHead>
              <TableHead className="w-[16%] text-end">Bookings</TableHead>
              <TableHead className="w-[26%] text-end">Revenue</TableHead>
              <TableHead className="w-[28%] ps-6">Occupancy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.court.id} className="border-border/60 hover:bg-muted/40">
                <TableCell>
                  <span className="flex items-center gap-2.5 font-medium">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                      <LandPlotIcon className="size-4 text-muted-foreground" />
                    </span>
                    {r.court.name}
                  </span>
                </TableCell>
                <TableCell className="text-end">
                  <span className="flex flex-col items-end gap-1">
                    <span className="font-mono tabular-nums">{r.bookings}</span>
                    <Delta value={delta(r.bookings, r.bookingsBefore)} className="text-xs" />
                  </span>
                </TableCell>
                <TableCell className="text-end">
                  <span className="font-mono tabular-nums">{inr(r.revenue)}</span>
                  <span className="ms-auto mt-1.5 block h-1 w-full max-w-40 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-chart-lead"
                      style={{ width: `${(r.revenue / best) * 100}%` }}
                    />
                  </span>
                </TableCell>
                <TableCell className="ps-6">
                  <span className="flex items-center gap-3">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-chart-2"
                        style={{ width: `${r.occupancy * 100}%` }}
                      />
                    </span>
                    <span className="w-10 text-end font-mono text-xs tabular-nums">
                      {formatPercent(r.occupancy, { decimals: 0 })}
                    </span>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mx-(--card-spacing) flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-3 text-sm">
        <span className="text-muted-foreground">All courts</span>
        <span className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span>
            <span className="font-mono tabular-nums">{now.bookings}</span>{" "}
            <span className="text-muted-foreground">bookings</span>
          </span>
          <span>
            <span className="font-mono tabular-nums">{inr(now.earningsPaise)}</span>{" "}
            <span className="text-muted-foreground">revenue</span>
          </span>
          <span>
            <span className="font-mono tabular-nums">
              {formatPercent(totalOpen ? totalBooked / totalOpen : 0, {
                decimals: 0,
              })}
            </span>{" "}
            <span className="text-muted-foreground">occupancy</span>
          </span>
        </span>
      </div>
    </Widget>
  );
}

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

interface ActivityItem {
  id: string;
  at: number;
  icon: LucideIcon;
  title: string;
  detail: string;
  live: boolean;
}

function ago(at: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - at) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function fromAudit(entry: AuditEntry, courtName: (id: string) => string): ActivityItem {
  const after = (entry.after ?? {}) as Record<string, unknown>;
  const before = (entry.before ?? {}) as Record<string, unknown>;
  const at = Date.parse(entry.createdAt);
  const base = { id: entry.id, at, live: true };
  const when = (local: unknown) =>
    typeof local === "string" ? `${dayLabel(local.slice(0, 10))}, ${local.slice(11)}` : "";
  switch (entry.action) {
    case "block.create":
      return {
        ...base,
        icon: ShieldOffIcon,
        title: `Blocked ${courtName(String(after.courtId))}`,
        detail: `${REASON_LABEL[after.reason as BlockReason] ?? "Block"} · ${when(after.from)}`,
      };
    case "block.delete":
      return {
        ...base,
        icon: ShieldOffIcon,
        title: `Unblocked ${courtName(String(before.courtId))}`,
        detail: `was ${when(before.from)}`,
      };
    case "court.schedule.update":
      return {
        ...base,
        icon: Clock3Icon,
        title: `Updated hours`,
        detail: courtName(entry.entityId),
      };
    case "court.prices.update":
      return {
        ...base,
        icon: TagIcon,
        title: `Updated prices`,
        detail: courtName(entry.entityId),
      };
    case "court.create":
      return {
        ...base,
        icon: LandPlotIcon,
        title: `Added a court`,
        detail: String(after.name ?? ""),
      };
    case "court.update":
      return {
        ...base,
        icon: LandPlotIcon,
        title: `Changed a court`,
        detail: String(after.name ?? ""),
      };
    case "venue.create":
      return {
        ...base,
        icon: Building2Icon,
        title: `Created a venue`,
        detail: String(after.name ?? ""),
      };
    case "venue.update":
      return {
        ...base,
        icon: Building2Icon,
        title: `Edited the venue`,
        detail: String(after.name ?? ""),
      };
    default:
      return {
        ...base,
        icon: HistoryIcon,
        title: entry.action,
        detail: entry.entityType,
      };
  }
}

function fromBookings(bookings: DemoBooking[], today: string): ActivityItem[] {
  const recent = bookings.filter((b) => b.date >= today).slice(0, 40);
  return recent.slice(0, 6).map((b, i) => {
    const at = Date.now() - (i * 47 + 9) * 60000;
    if (b.booking === "CANCELLED")
      return {
        id: `s-${b.id}`,
        at,
        icon: BanIcon,
        title: "Booking cancelled",
        detail: `${b.customer} · ${b.court} · ${inr(b.pricePaise)} refunded`,
        live: false,
      };
    if (b.source === "WALK_IN")
      return {
        id: `s-${b.id}`,
        at,
        icon: WalletIcon,
        title: "Walk-in added",
        detail: `${b.customer} · ${b.court}, ${b.start} · ${b.payment === "PAID" ? "paid" : "not paid"}`,
        live: false,
      };
    return {
      id: `s-${b.id}`,
      at,
      icon: CalendarCheckIcon,
      title: "New booking",
      detail: `${b.customer} · ${b.court}, ${b.date === today ? "today" : dayLabel(b.date)} ${b.start} · ${inr(b.pricePaise)} paid`,
      live: false,
    };
  });
}

export function RecentActivity({
  organisationId,
  manager,
  courts,
  bookings,
  today,
}: {
  organisationId: string;
  manager: boolean;
  courts: Court[];
  bookings: DemoBooking[];
  today: string;
}) {
  const audit = useQuery({
    queryKey: ["audit", organisationId],
    queryFn: () => api<AuditEntry[]>(`/organisations/${organisationId}/audit-log`),
    enabled: manager,
  });
  const courtName = (id: string) => courts.find((c) => c.id === id)?.name ?? "a court";
  const items = [
    ...(audit.data ?? []).slice(0, 12).map((e) => fromAudit(e, courtName)),
    ...fromBookings(bookings, today),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 6);
  return (
    <Widget>
      <WidgetHeader title="Recent activity" icon={HistoryIcon} />
      <ol className="flex flex-col px-(--card-spacing)">
        {items.map((item, i) => (
          <li
            key={item.id}
            className="relative grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-3 pb-5 last:pb-0"
          >
            {i < items.length - 1 && (
              <span className="absolute top-9 bottom-1 start-4 w-px bg-border" aria-hidden />
            )}
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full border bg-card",
                item.live ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col gap-1 pt-1">
              <span className="flex flex-wrap items-center gap-2 text-sm leading-tight font-medium">
                {item.title}
                {item.live ? (
                  <LiveBadge />
                ) : (
                  DEV_NOTES && (
                    <span className="text-[11px] font-normal text-muted-foreground">sample</span>
                  )
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground">{item.detail}</span>
            </div>
            <span className="pt-1 text-xs whitespace-nowrap text-muted-foreground">
              {ago(item.at)}
            </span>
          </li>
        ))}
      </ol>
    </Widget>
  );
}

function CardTitle({ title, badge }: { title: string; badge?: React.ReactNode }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      {title}
      {badge}
    </span>
  );
}
