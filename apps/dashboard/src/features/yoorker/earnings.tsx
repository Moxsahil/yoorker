import {
  BanknoteIcon,
  ChevronDownIcon,
  CreditCardIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  LandmarkIcon,
  QrCodeIcon,
  ReceiptTextIcon,
  SmartphoneIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv } from "@/kit/data/csv";
import { change } from "@/kit/data/format";
import { PageHeader } from "@/kit/ui-patterns/page-header";
import { StatusBadge, type Tone } from "@/kit/ui-patterns/status-badge";
import { Delta, Widget, WidgetHeader } from "@/kit/widgets/widget";
import { demoBookings } from "@/lib/demo-data";
import {
  COMMISSION_RATE,
  METHOD_LABEL,
  ONLINE,
  payouts,
  summarise,
  transactions,
  type EarningsSummary,
  type Method,
  type Transaction,
  type TxStatus,
} from "@/lib/earnings";
import { useManualBookings } from "@/lib/manual-bookings";
import { rangeLabel, type DateRange } from "@/lib/period";
import { useCurrentVenue } from "@/lib/session";
import { cn } from "@/lib/utils";
import { dayLabel, inr, todayAt } from "@/lib/yoorker";

import { SampleBadge } from "./common";
import { PeriodFilter, usePeriod } from "./period-filter";
import { EarningsSkeleton } from "./page-skeletons";

const METHOD_ICON: Record<Method, LucideIcon> = {
  UPI: SmartphoneIcon,
  CARD: CreditCardIcon,
  CASH: BanknoteIcon,
  COUNTER_UPI: QrCodeIcon,
};

const STATUS: Record<TxStatus, { label: string; tone: Tone }> = {
  PAID: { label: "Paid", tone: "success" },
  REFUNDED: { label: "Refunded", tone: "muted" },
  PENDING: { label: "Not paid", tone: "warning" },
};

const PAGE = 10;

const pct = `${Math.round(COMMISSION_RATE * 100)}%`;

const signed = (paise: number) => (paise < 0 ? `−${inr(-paise)}` : inr(paise));

function Line({
  label,
  caption,
  amount,
  out = false,
  strong = false,
}: {
  label: string;
  caption?: string;
  amount: number;
  out?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={cn("flex items-baseline justify-between gap-4 py-3", strong && "border-t pt-4")}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("text-sm", strong && "font-semibold")}>{label}</span>
        {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono tabular-nums",
          out && "text-muted-foreground",
          strong && "text-lg font-semibold",
        )}
      >
        {out && amount > 0 ? `−${inr(amount)}` : inr(amount)}
      </span>
    </div>
  );
}

function SummaryCard({
  now,
  before,
  range,
}: {
  now: EarningsSummary;
  before: EarningsSummary;
  range: DateRange;
}) {
  const venueShare = now.netPaise > 0 ? now.venuePaise / now.netPaise : 0;
  return (
    <Widget>
      <WidgetHeader title="Summary" icon={WalletIcon} />
      <div className="grid gap-x-10 gap-y-6 px-(--card-spacing) lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              Net earnings · {rangeLabel(range)}
            </span>
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-4xl font-semibold tracking-tight tabular-nums">
                {inr(now.netPaise)}
              </span>
              <Delta value={change(now.netPaise, before.netPaise)} />
            </span>
            <span className="text-xs text-muted-foreground">
              vs {inr(before.netPaise)} {range.days === 1 ? "the day before" : "the period before"}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            Of this, <span className="font-medium text-foreground">{inr(now.venuePaise)}</span> was
            collected at the venue and{" "}
            <span className="font-medium text-foreground">{inr(now.payoutPaise)}</span> is paid to
            your bank by Yoorker.
          </p>

          <div className="flex flex-col gap-2">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              <span className="bg-chart-2" style={{ width: `${venueShare * 100}%` }} />
              <span className="flex-1 bg-primary" />
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-chart-2" />
                At the venue {Math.round(venueShare * 100)}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" />
                To your bank {100 - Math.round(venueShare * 100)}%
              </span>
            </div>
          </div>

          {now.pendingPaise > 0 && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning-foreground dark:text-warning">
              {inr(now.pendingPaise)} of bookings in this period is still to be collected. It is not
              counted above.
            </p>
          )}
        </div>

        <div className="flex flex-col divide-y divide-border/60">
          <Line
            label="Total booking value"
            caption={`${now.bookings} bookings, paid or not`}
            amount={now.bookingValuePaise}
          />
          <Line
            label="Online"
            caption={`UPI ${inr(now.upiPaise)} · Card ${inr(now.cardPaise)}`}
            amount={now.onlinePaise}
          />
          <Line
            label="Cash & counter"
            caption={`Cash ${inr(now.cashPaise)} · UPI at counter ${inr(now.counterPaise)}`}
            amount={now.venuePaise}
          />
          <Line
            label="Refunds"
            caption={`${now.refunds} cancelled online booking${now.refunds === 1 ? "" : "s"}`}
            amount={now.refundsPaise}
            out
          />
          <Line
            label="Yoorker commission"
            caption={`${pct} of online payments after refunds`}
            amount={now.commissionPaise}
            out
          />
          <Line label="Net earnings" amount={now.netPaise} strong />
        </div>
      </div>
    </Widget>
  );
}

function TransactionsCard({ list, today }: { list: Transaction[]; today: string }) {
  const [shown, setShown] = useState(PAGE);
  return (
    <Widget className="xl:col-span-2">
      <WidgetHeader
        title={
          <span className="flex items-center gap-2">
            Recent transactions
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              {list.length}
            </span>
          </span>
        }
        icon={ReceiptTextIcon}
      />
      <div className="overflow-x-auto px-[calc(var(--card-spacing)-0.75rem)]">
        <Table className="min-w-[38rem] table-fixed [&_td]:px-3 [&_td]:py-3 [&_td:first-child]:rounded-s-lg [&_td:last-child]:rounded-e-lg [&_th]:h-9 [&_th]:px-3">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[42%]">Booking</TableHead>
              <TableHead className="w-[24%]">Method</TableHead>
              <TableHead className="w-[17%] text-end">Amount</TableHead>
              <TableHead className="w-[17%] ps-6">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No transactions in this period.
                </TableCell>
              </TableRow>
            )}
            {list.slice(0, shown).map((t) => {
              const Icon = METHOD_ICON[t.method];
              const b = t.booking;
              return (
                <TableRow key={b.id} className="border-border/60 hover:bg-muted/40">
                  <TableCell>
                    <span className="block truncate font-medium">{b.customer}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <span className="font-mono">{b.id}</span> · {b.court} ·{" "}
                      {b.date === today ? "Today" : dayLabel(b.date)}, {b.start}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon className="size-4 text-muted-foreground" />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm">{METHOD_LABEL[t.method]}</span>
                        <span className="text-xs text-muted-foreground">
                          {ONLINE.includes(t.method) ? "Online" : "At venue"}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-end font-mono tabular-nums",
                      t.status !== "PAID" && "text-muted-foreground",
                    )}
                  >
                    {signed(t.amountPaise)}
                  </TableCell>
                  <TableCell className="ps-6">
                    <StatusBadge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</StatusBadge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {list.length > PAGE && (
        <div className="flex items-center justify-between gap-3 px-(--card-spacing) text-sm text-muted-foreground">
          <span>
            Showing{" "}
            <span className="text-foreground tabular-nums">{Math.min(shown, list.length)}</span> of{" "}
            <span className="text-foreground tabular-nums">{list.length}</span>
          </span>
          {shown < list.length && (
            <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE * 2)}>
              Show {Math.min(PAGE * 2, list.length - shown)} more
            </Button>
          )}
        </div>
      )}
    </Widget>
  );
}

function PayoutsCard({ list }: { list: ReturnType<typeof payouts> }) {
  return (
    <Widget className="xl:self-start">
      <WidgetHeader title="Payouts" icon={LandmarkIcon} />
      <p className="-mt-2 px-(--card-spacing) text-xs text-muted-foreground">
        Online money for each week (Monday to Sunday), after refunds and commission, is sent to your
        bank the next Monday.
      </p>
      <ul className="mx-(--card-spacing) divide-y divide-border/60">
        {list.map((p) => (
          <li
            key={p.week}
            className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-0"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm">Week of {dayLabel(p.week).replace(/^\w+, /, "")}</span>
              <span className="text-xs text-muted-foreground">
                {p.status === "PAID" ? "Sent" : "Sending"} {dayLabel(p.paidOn)}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <span className="font-mono text-sm tabular-nums">{inr(p.amountPaise)}</span>
              <StatusBadge tone={p.status === "PAID" ? "success" : "info"}>
                {p.status === "PAID" ? "Paid out" : "Upcoming"}
              </StatusBadge>
            </span>
          </li>
        ))}
      </ul>
    </Widget>
  );
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function reportName(venue: string, range: DateRange, ext: string) {
  const span = range.days === 1 ? range.from : `${range.from}-to-${range.to}`;
  return `${slug(venue)}-earnings-${span}.${ext}`;
}

function downloadReportCsv(venue: string, range: DateRange, list: Transaction[]) {
  downloadCsv(
    reportName(venue, range, "csv"),
    [
      "Date",
      "Time",
      "Booking ID",
      "Customer",
      "Court",
      "Method",
      "Online or venue",
      "Amount (Rs)",
      "Status",
    ],
    list.map((t) => [
      t.booking.date,
      t.booking.start,
      t.booking.id,
      t.booking.customer,
      t.booking.court,
      METHOD_LABEL[t.method],
      ONLINE.includes(t.method) ? "Online" : "Venue",
      t.amountPaise / 100,
      STATUS[t.status].label,
    ]),
  );
}

/** Summary first, then every transaction. The PDF fonts have no ₹ sign, so amounts read "Rs". */
async function downloadReportPdf(
  venue: string,
  range: DateRange,
  s: EarningsSummary,
  list: Transaction[],
) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const rs = (paise: number) =>
    `${paise < 0 ? "-" : ""}Rs ${(Math.abs(paise) / 100).toLocaleString("en-IN")}`;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`${venue} · Earnings report`, 40, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`${rangeLabel(range)} ${range.from.slice(0, 4)}`, 40, 66);
  doc.setTextColor(30);
  doc.text(
    `Of the net earnings, ${rs(s.venuePaise)} was collected at the venue and ${rs(s.payoutPaise)} is paid to your bank by Yoorker.`,
    40,
    90,
    { maxWidth: 515 },
  );
  autoTable(doc, {
    startY: 110,
    body: [
      ["Total booking value", `${s.bookings} bookings`, rs(s.bookingValuePaise)],
      ["Online", `UPI ${rs(s.upiPaise)}, card ${rs(s.cardPaise)}`, rs(s.onlinePaise)],
      [
        "Cash & counter",
        `Cash ${rs(s.cashPaise)}, UPI at counter ${rs(s.counterPaise)}`,
        rs(s.venuePaise),
      ],
      ["Refunds", `${s.refunds} cancelled online bookings`, rs(-s.refundsPaise)],
      ["Yoorker commission", `${pct} of online after refunds`, rs(-s.commissionPaise)],
      ["Net earnings", "", rs(s.netPaise)],
      ["Still to collect", "Not counted above", rs(s.pendingPaise)],
    ],
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 150 },
      1: { textColor: 110 },
      2: { halign: "right", cellWidth: 110 },
    },
    didParseCell: (data) => {
      if (data.row.index === 5) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
    margin: { left: 40, right: 40 },
  });
  const after = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Transactions", 40, after + 30);
  autoTable(doc, {
    startY: after + 40,
    head: [["Date", "Booking", "Customer", "Method", "Amount", "Status"]],
    body: list.map((t) => [
      `${dayLabel(t.booking.date)}, ${t.booking.start}`,
      t.booking.id,
      t.booking.customer,
      METHOD_LABEL[t.method],
      rs(t.amountPaise),
      STATUS[t.status].label,
    ]),
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 4: { halign: "right" } },
    margin: { left: 40, right: 40 },
  });
  doc.save(reportName(venue, range, "pdf"));
}

export function EarningsPage() {
  const { courts, venue, loading } = useCurrentVenue();
  const today = todayAt();
  const period = usePeriod(today);
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
  const { range, previous } = period;
  const now = useMemo(() => summarise(all, range, today), [all, range, today]);
  const before = useMemo(() => summarise(all, previous, today), [all, previous, today]);
  const list = useMemo(() => transactions(all, range, today), [all, range, today]);
  const weekly = useMemo(() => payouts(all, today), [all, today]);
  const venueName = venue?.name ?? "Venue";

  if (loading) return <EarningsSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Earnings & payouts"
        description="What players paid, Yoorker's commission and what reaches your bank."
        meta={<SampleBadge sprint="Sprints 5–7" />}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <DownloadIcon data-icon="inline-start" />
              Download report
              <ChevronDownIcon data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={() => downloadReportCsv(venueName, range, list)}>
                <FileSpreadsheetIcon />
                <span className="flex flex-col">
                  CSV
                  <span className="text-xs text-muted-foreground">
                    Every transaction, for Excel or Sheets
                  </span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadReportPdf(venueName, range, now, list)}>
                <FileTextIcon />
                <span className="flex flex-col">
                  PDF
                  <span className="text-xs text-muted-foreground">
                    Summary and transactions, to print
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <PeriodFilter today={today} state={period} />
      <SummaryCard now={now} before={before} range={range} />
      <div className="grid gap-4 xl:grid-cols-3">
        <TransactionsCard key={`${range.from}-${range.to}`} list={list} today={today} />
        <PayoutsCard list={weekly} />
      </div>
    </div>
  );
}
