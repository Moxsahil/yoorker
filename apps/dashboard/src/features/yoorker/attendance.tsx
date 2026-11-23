import {
  CalendarCheck2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  IndianRupeeIcon,
  SunIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { toast } from "@/components/ui/toast";
import { downloadCsv } from "@/kit/data/csv";
import { Segmented } from "@/kit/ui-patterns/segmented";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import { addDays } from "@/lib/period";
import { cn } from "@/lib/utils";
import { dayLabel, inr, WEEKDAY_SHORT, type Role } from "@/lib/yoorker";

type Mark = "P" | "H" | "L" | "A" | "O";

export interface AttendanceMember {
  id: string;
  name: string;
  phone: string;
  role: Role;
  title: string;
  lastActive: string | null;
}

const MARK: Record<Mark, { label: string; cell: string; dot: string; short: string }> = {
  P: {
    label: "Present",
    short: "P",
    cell: "bg-success/15 text-success",
    dot: "bg-success",
  },
  H: {
    label: "Half day",
    short: "H",
    cell: "bg-warning/20 text-warning-foreground dark:text-warning",
    dot: "bg-warning",
  },
  L: {
    label: "Leave",
    short: "L",
    cell: "bg-info/15 text-info",
    dot: "bg-info",
  },
  A: {
    label: "Absent",
    short: "A",
    cell: "bg-destructive/15 text-destructive",
    dot: "bg-destructive",
  },
  O: {
    label: "Weekly off",
    short: "–",
    cell: "bg-muted/60 text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
};

const SAMPLE_SALARY: Record<AttendanceMember["role"], number> = {
  OWNER: 0,
  MANAGER: 2_500_000,
  STAFF: 1_400_000,
};

const hash = (text: string) => {
  let h = 0x811c9dc5;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
};

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;

const offDay = (member: AttendanceMember) => (hash(member.id) % 7) + 1;

const daysOf = (month: string) => {
  const first = `${month}-01`;
  const count = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
  return Array.from({ length: count }, (_, i) => addDays(first, i));
};

const shiftMonth = (month: string, by: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

const monthName = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** SAMPLE register: mostly present, the odd half day, leave or absence. */
function sampleMark(member: AttendanceMember, date: string, today: string): Mark | null {
  if (date > today) return null;
  if (weekdayOf(date) === offDay(member)) return "O";
  if (date === today) return member.lastActive === today ? "P" : null;
  const roll = hash(`${member.id}|${date}`) % 100;
  return roll < 84 ? "P" : roll < 90 ? "H" : roll < 95 ? "L" : "A";
}

const checkIn = (member: AttendanceMember, date: string) => {
  const minutes = 5 * 60 + 30 + (hash(`in|${member.id}|${date}`) % 75);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

interface Totals {
  P: number;
  H: number;
  L: number;
  A: number;
  unmarked: number;
  workingDays: number;
  paidDays: number;
  payablePaise: number;
}

function totalsFor(
  member: AttendanceMember,
  days: string[],
  markOf: (date: string) => Mark | null,
  today: string,
  salaryPaise: number,
): Totals {
  const t: Totals = {
    P: 0,
    H: 0,
    L: 0,
    A: 0,
    unmarked: 0,
    workingDays: days.filter((d) => weekdayOf(d) !== offDay(member)).length,
    paidDays: 0,
    payablePaise: 0,
  };
  for (const date of days) {
    if (date > today) continue;
    const mark = markOf(date);
    if (mark === null) t.unmarked++;
    else if (mark !== "O") t[mark]++;
  }
  t.paidDays = t.P + t.L + t.H / 2;
  t.payablePaise = Math.round(t.workingDays ? (salaryPaise / t.workingDays) * t.paidDays : 0);
  return t;
}

export function AttendanceTab({ team, today }: { team: AttendanceMember[]; today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [edits, setEdits] = useState<Record<string, Mark | null>>({});
  const [salaries, setSalaries] = useState<Record<string, number>>({});
  const days = useMemo(() => daysOf(month), [month]);
  const thisMonth = today.slice(0, 7);

  const markOf = (member: AttendanceMember, date: string): Mark | null => {
    const key = `${member.id}|${date}`;
    return key in edits ? edits[key]! : sampleMark(member, date, today);
  };
  const salaryOf = (m: AttendanceMember) => salaries[m.id] ?? SAMPLE_SALARY[m.role];
  const setMark = (member: AttendanceMember, date: string, mark: Mark | null) =>
    setEdits((all) => ({ ...all, [`${member.id}|${date}`]: mark }));

  const totals = team.map((m) => totalsFor(m, days, (d) => markOf(m, d), today, salaryOf(m)));
  const todayMarked = team.filter((m) => markOf(m, today) !== null).length;

  const exportCsv = () => {
    downloadCsv(
      `attendance-${month}.csv`,
      [
        "Name",
        "Phone",
        "Role",
        ...days.map((d) => d.slice(8)),
        "Present",
        "Half days",
        "Leave",
        "Absent",
        "Working days",
        "Paid days",
        "Monthly salary (Rs)",
        "Payable (Rs)",
      ],
      team.map((m, i) => {
        const t = totals[i]!;
        return [
          m.name,
          m.phone,
          m.title,
          ...days.map((d) => {
            const mark = markOf(m, d);
            return mark === null ? "" : mark === "O" ? "OFF" : mark;
          }),
          t.P,
          t.H,
          t.L,
          t.A,
          t.workingDays,
          t.paidDays,
          salaryOf(m) / 100,
          Math.round(t.payablePaise / 100),
        ];
      }),
    );
  };

  if (team.length === 0) {
    return (
      <Widget>
        <p className="px-(--card-spacing) py-6 text-center text-sm text-muted-foreground">
          No one to track yet. Invite staff, and their attendance shows here once they sign in.
        </p>
      </Widget>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {month === thisMonth && (
        <Widget>
          <WidgetHeader
            title={
              <span className="flex items-center gap-2">
                Today
                <span className="text-sm font-normal text-muted-foreground">
                  {dayLabel(today)} · {todayMarked} of {team.length} marked
                </span>
              </span>
            }
            icon={SunIcon}
          />
          <ul className="mx-(--card-spacing) divide-y divide-border/60">
            {team.map((m) => {
              const mark = markOf(m, today);
              const off = weekdayOf(today) === offDay(m);
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{m.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {off
                        ? "Weekly off today"
                        : mark === "P" || mark === "H"
                          ? `Checked in ${checkIn(m, today)}`
                          : mark === null
                            ? "Not marked yet"
                            : MARK[mark].label}
                    </span>
                  </span>
                  {off ? (
                    <span className="text-sm text-muted-foreground">Off</span>
                  ) : (
                    <Segmented<Mark | "none">
                      aria-label={`${m.name} today`}
                      className="w-auto"
                      value={mark ?? "none"}
                      onChange={(next) => {
                        setMark(m, today, next === "none" ? null : next);
                        if (next !== "none")
                          toast.add({
                            type: "success",
                            title: `${m.name}: ${MARK[next].label.toLowerCase()} today`,
                          });
                      }}
                      options={[
                        { value: "P", label: "Present" },
                        { value: "H", label: "Half day" },
                        { value: "L", label: "Leave" },
                        { value: "A", label: "Absent" },
                      ]}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </Widget>
      )}

      <Widget>
        <WidgetHeader
          title={
            <span className="flex items-center gap-2">
              Register
              <span className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Previous month"
                  onClick={() => setMonth((m) => shiftMonth(m, -1))}
                >
                  <ChevronLeftIcon />
                </Button>
                <span className="min-w-32 text-center text-sm font-normal">{monthName(month)}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Next month"
                  disabled={month >= thisMonth}
                  onClick={() => setMonth((m) => shiftMonth(m, 1))}
                >
                  <ChevronRightIcon />
                </Button>
              </span>
            </span>
          }
          icon={CalendarCheck2Icon}
          action={
            <Button variant="outline" size="sm" className="me-2" onClick={exportCsv}>
              <DownloadIcon data-icon="inline-start" />
              Export for salary
            </Button>
          }
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-(--card-spacing) text-xs text-muted-foreground">
          {(Object.keys(MARK) as Mark[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", MARK[k].dot)} />
              {MARK[k].label}
            </span>
          ))}
          <span>· Tap a day to change it</span>
        </div>
        <div className="overflow-x-auto px-(--card-spacing)">
          <table className="w-full border-separate border-spacing-0.5 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-40 bg-card pe-3 text-start font-medium text-muted-foreground">
                  Member
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    className={cn(
                      "min-w-7 pb-1 text-center font-normal",
                      d === today ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    <span className="block text-[10px]">
                      {WEEKDAY_SHORT[weekdayOf(d) - 1]!.slice(0, 1)}
                    </span>
                    <span className="font-mono tabular-nums">{Number(d.slice(8))}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((m) => (
                <tr key={m.id}>
                  <td className="sticky left-0 z-10 bg-card py-1 pe-3">
                    <span className="block truncate text-sm font-medium">{m.name}</span>
                    <span className="text-muted-foreground">
                      Off on {WEEKDAY_SHORT[offDay(m) - 1]}
                    </span>
                  </td>
                  {days.map((d) => {
                    const mark = markOf(m, d);
                    const future = d > today;
                    return (
                      <td key={d} className="p-0">
                        {future ? (
                          <span className="block h-8 rounded-md bg-muted/20" />
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <button
                                  type="button"
                                  title={`${m.name}, ${dayLabel(d)}: ${mark ? MARK[mark].label : "not marked"}`}
                                  className={cn(
                                    "flex h-8 w-full items-center justify-center rounded-md font-mono text-[11px] font-medium transition-[filter] hover:brightness-125",
                                    mark
                                      ? MARK[mark].cell
                                      : "border border-dashed text-muted-foreground",
                                  )}
                                />
                              }
                            >
                              {mark ? MARK[mark].short : "?"}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-44">
                              <DropdownMenuLabel>
                                {m.name.split(" ")[0]}, {dayLabel(d)}
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {(Object.keys(MARK) as Mark[]).map((k) => (
                                <DropdownMenuItem key={k} onClick={() => setMark(m, d, k)}>
                                  <span className={cn("size-2 rounded-full", MARK[k].dot)} />
                                  {MARK[k].label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Widget>

      <Widget>
        <WidgetHeader title={`Salary for ${monthName(month)}`} icon={IndianRupeeIcon} />
        <p className="-mt-2 px-(--card-spacing) text-xs text-muted-foreground">
          Pay = monthly salary ÷ working days (days in the month minus weekly offs) × paid days.
          Paid days are present days and leave, plus half of each half day. Absent days are not
          paid.
          {month === thisMonth && " The month isn't over, so this is pay so far."}
        </p>
        <div className="overflow-x-auto px-[calc(var(--card-spacing)-0.75rem)]">
          <Table className="min-w-[52rem] table-fixed [&_td]:px-3 [&_td]:py-3 [&_td:first-child]:rounded-s-lg [&_td:last-child]:rounded-e-lg [&_th]:h-9 [&_th]:px-3">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[22%]">Member</TableHead>
                <TableHead className="w-[17%]">Monthly salary</TableHead>
                <TableHead className="w-[7%] text-center">Present</TableHead>
                <TableHead className="w-[7%] text-center">Half</TableHead>
                <TableHead className="w-[7%] text-center">Leave</TableHead>
                <TableHead className="w-[7%] text-center">Absent</TableHead>
                <TableHead className="w-[15%] text-center">Paid days</TableHead>
                <TableHead className="w-[18%] text-end">Payable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.map((m, i) => {
                const t = totals[i]!;
                return (
                  <TableRow key={m.id} className="border-border/60 hover:bg-muted/40">
                    <TableCell>
                      <span className="block truncate font-medium">{m.name}</span>
                      <span className="text-xs text-muted-foreground">{m.title}</span>
                    </TableCell>
                    <TableCell>
                      <div className="relative w-32">
                        <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          ₹
                        </span>
                        <Input
                          aria-label={`${m.name} monthly salary`}
                          inputMode="numeric"
                          value={String(salaryOf(m) / 100)}
                          onChange={(e) =>
                            setSalaries((all) => ({
                              ...all,
                              [m.id]: Number(e.target.value.replace(/\D/g, "")) * 100,
                            }))
                          }
                          className="h-8 ps-6 font-mono tabular-nums"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono tabular-nums">{t.P}</TableCell>
                    <TableCell className="text-center font-mono tabular-nums">{t.H}</TableCell>
                    <TableCell className="text-center font-mono tabular-nums">{t.L}</TableCell>
                    <TableCell
                      className={cn(
                        "text-center font-mono tabular-nums",
                        t.A > 0 && "text-destructive",
                      )}
                    >
                      {t.A}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-mono tabular-nums">{t.paidDays}</span>
                      <span className="text-muted-foreground"> / {t.workingDays}</span>
                      {t.unmarked > 0 && (
                        <span className="block text-xs text-warning-foreground dark:text-warning">
                          {t.unmarked} not marked
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-end font-mono font-medium tabular-nums">
                      {inr(t.payablePaise)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="text-end text-muted-foreground">
                  Total payable
                </TableCell>
                <TableCell className="text-end font-mono text-base font-semibold tabular-nums">
                  {inr(totals.reduce((s, t) => s + t.payablePaise, 0))}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Widget>
    </div>
  );
}
