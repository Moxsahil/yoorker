import {
  ChevronDownIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv } from "@/kit/data/csv";
import { PageHeader } from "@/kit/ui-patterns/page-header";
import { StatusBadge } from "@/kit/ui-patterns/status-badge";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import { demoBookings, demoCustomers, type DemoCustomer } from "@/lib/demo-data";
import { daysBetween } from "@/lib/period";
import { useCurrentVenue } from "@/lib/session";
import { dayLabel, inr, todayAt } from "@/lib/yoorker";

import { SampleBadge } from "./common";
import { CustomersSkeleton } from "./page-skeletons";

const PAGE = 40;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const ago = (date: string, today: string) => {
  const days = daysBetween(date, today) - 1;
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
};

const COLUMNS = [
  "Customer",
  "Mobile",
  "Bookings",
  "Spent (Rs)",
  "Cancelled",
  "Last played",
  "No-shows",
];

const exportRow = (c: DemoCustomer) => [
  c.name,
  c.phone,
  c.bookings,
  c.spentPaise / 100,
  c.cancelled,
  c.lastPlayed,
  c.noShows,
];

const fileName = (venue: string, today: string, ext: string) =>
  `${venue.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-customers-${today}.${ext}`;

/** A4 landscape table. The PDF fonts have no ₹ sign, so amounts read "Rs 70,500". */
async function downloadPdf(venue: string, today: string, rows: DemoCustomer[], search: string) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const rupees = (paise: number) => `Rs ${(paise / 100).toLocaleString("en-IN")}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`${venue} · Customers`, 40, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(
    [
      `Played in the last 60 days, up to ${dayLabel(today)}. ${rows.length} customers${search ? `, matching "${search}"` : ""}.`,
      `Total spent ${rupees(rows.reduce((sum, c) => sum + c.spentPaise, 0))}.`,
    ],
    40,
    66,
  );
  autoTable(doc, {
    startY: 96,
    head: [COLUMNS.map((c) => c.replace(" (Rs)", ""))],
    body: rows.map((c) => [
      c.name,
      c.phone,
      c.bookings,
      rupees(c.spentPaise),
      c.cancelled,
      dayLabel(c.lastPlayed),
      c.noShows || "None",
    ]),
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "center" },
      6: { halign: "center" },
    },
    margin: { left: 40, right: 40 },
  });
  doc.save(fileName(venue, today, "pdf"));
}

export function CustomersPage() {
  const { courts, venue, loading } = useCurrentVenue();
  const venueName = venue?.name ?? "Venue";
  const today = todayAt();
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);
  const customers = useMemo(
    () =>
      demoCustomers(
        demoBookings(
          today,
          courts.map((c) => c.name),
        ),
        today,
      ),
    [courts, today],
  );
  const query = search.trim().toLowerCase();
  const digits = query.replace(/\D/g, "");
  const rows = customers.filter(
    (c) =>
      !query ||
      c.name.toLowerCase().includes(query) ||
      (digits.length > 2 && c.phone.replace(/\D/g, "").includes(digits)),
  );

  if (loading) return <CustomersSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customers"
        description="Everyone who has played here in the last 60 days, best customers first."
        meta={<SampleBadge sprint="Sprint 8" />}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" disabled={rows.length === 0} />}>
              <DownloadIcon data-icon="inline-start" />
              Export
              <ChevronDownIcon data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() =>
                  downloadCsv(fileName(venueName, today, "csv"), COLUMNS, rows.map(exportRow))
                }
              >
                <FileSpreadsheetIcon />
                <span className="flex flex-col">
                  CSV
                  <span className="text-xs text-muted-foreground">
                    Opens in Excel or Google Sheets
                  </span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadPdf(venueName, today, rows, search)}>
                <FileTextIcon />
                <span className="flex flex-col">
                  PDF
                  <span className="text-xs text-muted-foreground">Ready to print or share</span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <Widget>
        <WidgetHeader
          title={`${rows.length} ${rows.length === 1 ? "customer" : "customers"}`}
          icon={UsersIcon}
          action={
            <Input
              placeholder="Search name or phone"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShown(PAGE);
              }}
              className="me-2 h-8 w-64 max-w-[50vw]"
            />
          }
        />
        <div className="overflow-x-auto px-[calc(var(--card-spacing)-0.75rem)]">
          <Table className="min-w-[54rem] table-fixed [&_td]:px-3 [&_td]:py-3 [&_td:first-child]:rounded-s-lg [&_td:last-child]:rounded-e-lg [&_th]:h-9 [&_th]:px-3">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[24%]">Customer</TableHead>
                <TableHead className="w-[16%]">Mobile</TableHead>
                <TableHead className="w-[10%] text-end">Bookings</TableHead>
                <TableHead className="w-[12%] text-end">Spent</TableHead>
                <TableHead className="w-[11%] text-center">Cancelled</TableHead>
                <TableHead className="w-[15%] ps-8">Last played</TableHead>
                <TableHead className="w-[12%]">No-shows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No customer matches &ldquo;{search}&rdquo;.
                  </TableCell>
                </TableRow>
              )}
              {rows.slice(0, shown).map((c) => (
                <TableRow key={c.name} className="border-border/60 hover:bg-muted/40">
                  <TableCell>
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
                        aria-hidden
                      >
                        {initials(c.name)}
                      </span>
                      <span className="truncate font-medium">{c.name}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <a
                      href={`tel:${c.phone.replace(/\s/g, "")}`}
                      className="font-mono text-sm whitespace-nowrap tabular-nums hover:text-primary hover:underline"
                    >
                      {c.phone}
                    </a>
                  </TableCell>
                  <TableCell className="text-end font-mono tabular-nums">{c.bookings}</TableCell>
                  <TableCell className="text-end font-mono font-medium tabular-nums">
                    {inr(c.spentPaise)}
                  </TableCell>
                  <TableCell className="text-center font-mono tabular-nums">
                    {c.cancelled > 0 ? (
                      c.cancelled
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="ps-8">
                    <span className="block">{dayLabel(c.lastPlayed)}</span>
                    <span className="text-xs text-muted-foreground">
                      {ago(c.lastPlayed, today)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {c.noShows > 0 ? (
                      <StatusBadge tone="danger">
                        {c.noShows} no-show{c.noShows > 1 ? "s" : ""}
                      </StatusBadge>
                    ) : (
                      <span className="text-sm text-muted-foreground">None</span>
                    )}
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
    </div>
  );
}
