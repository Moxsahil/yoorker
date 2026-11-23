import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  Clock3Icon,
  CopyIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  selectTriggerClassName,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Segmented } from "@/kit/ui-patterns/segmented";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  lengthLabel,
  QUARTER_HOURS,
  SPORT_LABEL,
  WEEKDAY_SHORT,
  type Court,
  type CourtSchedule,
  type Sport,
} from "@/lib/yoorker";

const STEPS = [15, 30, 60] as const;
type Step = (typeof STEPS)[number];

const MAX_WINDOWS = 4;
const MAX_LENGTHS = 12;
const LENGTHS = Array.from({ length: 48 }, (_, i) => (i + 1) * 15);

const DEFAULT_WINDOW = { opens: "06:00", closes: "23:00" };

interface Window {
  opens: string;
  closes: string;
}

interface Draft {
  step: Step;
  alwaysOpen: boolean;
  days: { weekday: number; open: boolean; windows: Window[] }[];
  lengths: { minutes: number; label: string; sport: Sport | ""; price: string }[];
}

function draftOf(schedule: CourtSchedule): Draft {
  return {
    step: (STEPS as readonly number[]).includes(schedule.startStepMinutes)
      ? (schedule.startStepMinutes as Step)
      : 30,
    alwaysOpen: schedule.alwaysOpen,
    days: schedule.days.map((day) => ({
      weekday: day.weekday,
      open: !schedule.alwaysOpen && day.windows.length > 0,
      windows: schedule.alwaysOpen || day.windows.length === 0 ? [DEFAULT_WINDOW] : day.windows,
    })),
    lengths: schedule.durations.map((d) => ({
      minutes: d.minutes,
      label: d.label ?? "",
      sport: d.sport ?? "",
      price: d.pricePaise === null ? "" : String(d.pricePaise / 100),
    })),
  };
}

const pastMidnight = (w: Window) => w.closes <= w.opens;

type Tab = "hours" | "lengths";
type Issue = { path: string; message: string };
type Update = (change: (d: Draft) => Draft) => void;

const issuesUnder = (issues: Issue[], prefix: string) =>
  issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`));

function ScheduleDialog({
  court,
  schedule,
  open,
  onOpenChange,
}: {
  court: Court;
  schedule: CourtSchedule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(() => draftOf(schedule));
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("hours");

  // Stable, so the memoised panels skip re-rendering when only the tab or the other panel changes.
  const update = useCallback<Update>((change) => {
    setDraft(change);
    setIssues([]);
  }, []);

  const general = issues.filter((i) => !/^(days|durations)\.\d+/.test(i.path));

  const badPrice = draft.lengths.some((l) => l.price !== "" && !/^\d+$/.test(l.price));
  const problem =
    draft.lengths.length === 0
      ? "Add at least one booking length."
      : badPrice
        ? "Package prices are whole rupees."
        : null;

  const save = async () => {
    if (problem) return;
    setBusy(true);
    try {
      await api<CourtSchedule>(`/courts/${court.id}/schedule`, {
        method: "PUT",
        body: {
          startStepMinutes: draft.step,
          durations: draft.lengths.map((l) => ({
            minutes: l.minutes,
            label: l.label.trim() || null,
            sport: l.sport || null,
            pricePaise: l.price === "" ? null : Number(l.price) * 100,
          })),
          ...(draft.alwaysOpen
            ? { alwaysOpen: true }
            : {
                days: draft.days.map((day) => ({
                  weekday: day.weekday,
                  windows: day.open ? day.windows : [],
                })),
              }),
        },
      });
      await Promise.all(
        ["schedule", "grid", "slots"].map((key) =>
          client.invalidateQueries({ queryKey: [key, court.id] }),
        ),
      );
      toast.add({ type: "success", title: `${court.name}: hours and booking lengths saved` });
      onOpenChange(false);
    } catch (error) {
      const body = error instanceof ApiError ? (error.body as { issues?: unknown }) : null;
      if (body && Array.isArray(body.issues)) {
        const found = body.issues as Issue[];
        setIssues(found);
        const first = found[0]?.path ?? "";
        if (first.startsWith("days")) setTab("hours");
        else if (first.startsWith("durations")) setTab("lengths");
      } else {
        toast.add({
          type: "error",
          title: "Couldn't save the hours",
          description: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const hoursIssue = issues.some((i) => i.path.startsWith("days") || i.path === "alwaysOpen");
  const lengthsIssue = issues.some((i) => i.path.startsWith("durations")) || Boolean(problem);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="p-4 pb-3">
          <DialogTitle>Hours & booking lengths · {court.name}</DialogTitle>
          <DialogDescription>
            When players can book this court, and for how long. Changes apply to new bookings.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList variant="line" className="h-9 w-full justify-start gap-5 border-b px-4 py-0">
            <TabsTrigger value="hours" className="flex-none px-0">
              Opening hours
              {hoursIssue && <span className="size-1.5 rounded-full bg-destructive" />}
            </TabsTrigger>
            <TabsTrigger value="lengths" className="flex-none px-0">
              Booking lengths
              {lengthsIssue && <span className="size-1.5 rounded-full bg-destructive" />}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[min(58vh,30rem)]">
            <TabsContent keepMounted value="hours" className="flex flex-col gap-3 p-4">
              <HoursPanel
                alwaysOpen={draft.alwaysOpen}
                days={draft.days}
                issues={issues}
                update={update}
              />
            </TabsContent>

            <TabsContent keepMounted value="lengths" className="flex flex-col gap-6 p-4">
              <LengthsPanel
                step={draft.step}
                lengths={draft.lengths}
                issues={issues}
                problem={problem}
                court={court}
                update={update}
              />
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="m-0 items-center">
          {general.map((issue) => (
            <p key={issue.path + issue.message} className="me-auto text-xs text-destructive">
              {issue.message}
            </p>
          ))}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || Boolean(problem)} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const HoursPanel = memo(function HoursPanel({
  alwaysOpen,
  days,
  issues,
  update,
}: {
  alwaysOpen: boolean;
  days: Draft["days"];
  issues: Issue[];
  update: Update;
}) {
  const issuesAt = (prefix: string) => issuesUnder(issues, prefix);
  const setDay = (weekday: number, change: (day: Draft["days"][number]) => Draft["days"][number]) =>
    update((d) => ({
      ...d,
      days: d.days.map((day) => (day.weekday === weekday ? change(day) : day)),
    }));

  return (
    <>
      <label className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 px-3 py-2.5">
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Open 24 hours, every day</span>
          <span className="text-xs text-muted-foreground">
            Players can book any time, day or night.
          </span>
        </span>
        <Switch
          checked={alwaysOpen}
          onCheckedChange={(on) => update((d) => ({ ...d, alwaysOpen: on }))}
        />
      </label>

      {!alwaysOpen && (
        <ul className="divide-y divide-border/60">
          {days.map((day, d) => {
            const name = WEEKDAY_SHORT[day.weekday - 1];
            const dayIssues = issuesAt(`days.${d}`);
            return (
              <li key={day.weekday} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                <label className="flex h-7 items-center gap-2.5 font-medium">
                  <Switch
                    size="sm"
                    checked={day.open}
                    onCheckedChange={(on) => setDay(day.weekday, (x) => ({ ...x, open: on }))}
                  />
                  {name}
                </label>

                {day.open ? (
                  <div className="flex flex-col gap-2">
                    {day.windows.map((w, i) => {
                      const invalid = issuesAt(`days.${d}.windows.${i}`).length > 0;
                      const setWindow = (change: Partial<Window>) =>
                        setDay(day.weekday, (x) => ({
                          ...x,
                          windows: x.windows.map((v, j) => (j === i ? { ...v, ...change } : v)),
                        }));
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <TimeSelect
                            label={`${name} opens`}
                            value={w.opens}
                            invalid={invalid}
                            onChange={(opens) => setWindow({ opens })}
                          />
                          <span className="text-muted-foreground">–</span>
                          <TimeSelect
                            label={`${name} closes`}
                            value={w.closes}
                            invalid={invalid}
                            onChange={(closes) => setWindow({ closes })}
                          />
                          <span className="w-14 text-xs text-muted-foreground">
                            {pastMidnight(w) && "next day"}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${w.opens}–${w.closes}`}
                            className={cn(day.windows.length === 1 && "invisible")}
                            onClick={() =>
                              setDay(day.weekday, (x) => ({
                                ...x,
                                windows: x.windows.filter((_, j) => j !== i),
                              }))
                            }
                          >
                            <Trash2Icon />
                          </Button>
                          {i === 0 && (
                            <div className="ms-auto flex gap-1">
                              {day.windows.length < MAX_WINDOWS && (
                                <IconAction
                                  label="Add hours"
                                  onClick={() =>
                                    setDay(day.weekday, (x) => ({
                                      ...x,
                                      windows: [
                                        ...x.windows,
                                        {
                                          opens: x.windows.at(-1)?.closes ?? "06:00",
                                          closes: "23:00",
                                        },
                                      ],
                                    }))
                                  }
                                >
                                  <PlusIcon />
                                </IconAction>
                              )}
                              <IconAction
                                label={`Copy ${name} to every day`}
                                onClick={() =>
                                  update((x) => ({
                                    ...x,
                                    days: x.days.map((other) => ({
                                      ...other,
                                      open: true,
                                      windows: day.windows,
                                    })),
                                  }))
                                }
                              >
                                <CopyIcon />
                              </IconAction>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {dayIssues.map((issue) => (
                      <p key={issue.path + issue.message} className="text-xs text-destructive">
                        {issue.message}
                      </p>
                    ))}
                  </div>
                ) : (
                  <span className="flex h-7 items-center text-muted-foreground">Closed</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
});

const LengthsPanel = memo(function LengthsPanel({
  step,
  lengths,
  issues,
  problem,
  court,
  update,
}: {
  step: Step;
  lengths: Draft["lengths"];
  issues: Issue[];
  problem: string | null;
  court: Court;
  update: Update;
}) {
  const issuesAt = (prefix: string) => issuesUnder(issues, prefix);
  const multiSport = court.sports.length > 1;
  const setLength = (index: number, change: Partial<Draft["lengths"][number]>) =>
    update((d) => ({
      ...d,
      lengths: d.lengths.map((l, i) => (i === index ? { ...l, ...change } : l)),
    }));

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label>Bookings can start every</Label>
        <Segmented<`${Step}`>
          aria-label="Bookings can start every"
          className="w-auto self-start"
          value={`${step}`}
          onChange={(v) => update((d) => ({ ...d, step: Number(v) as Step }))}
          options={STEPS.map((s) => ({ value: `${s}` as const, label: `${s} min` }))}
        />
        <p className="text-xs text-muted-foreground">
          With 30, a 1 h slot can start at 6:00, 6:30, 7:00 and so on.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <Label>Booking lengths</Label>
          <p className="text-xs text-muted-foreground">
            A label like &ldquo;T20 match&rdquo; shows instead of the time. A package price is the
            whole booking&apos;s price; leave it blank to charge per hour.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <div
            className={cn("grid gap-2 text-xs text-muted-foreground", lengthColumns(multiSport))}
          >
            <span>Length</span>
            <span>Label</span>
            {multiSport && <span>Sport</span>}
            <span>Package price</span>
          </div>
          {lengths.map((l, i) => {
            const lengthIssues = issuesAt(`durations.${i}`);
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className={cn("grid items-center gap-2", lengthColumns(multiSport))}>
                  <NativeSelect
                    aria-label="Length"
                    aria-invalid={lengthIssues.length > 0 || undefined}
                    className="w-full"
                    value={String(l.minutes)}
                    onChange={(e) => setLength(i, { minutes: Number(e.target.value) })}
                  >
                    {LENGTHS.map((m) => (
                      <NativeSelectOption key={m} value={String(m)}>
                        {lengthLabel(m)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Input
                    aria-label="Label"
                    placeholder="Optional"
                    maxLength={40}
                    value={l.label}
                    onChange={(e) => setLength(i, { label: e.target.value })}
                  />
                  {multiSport && (
                    <NativeSelect
                      aria-label="Sport"
                      className="w-full"
                      value={l.sport}
                      onChange={(e) => setLength(i, { sport: e.target.value as Sport | "" })}
                    >
                      <NativeSelectOption value="">Every sport</NativeSelectOption>
                      {court.sports.map((sport) => (
                        <NativeSelectOption key={sport} value={sport}>
                          {SPORT_LABEL[sport]}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  )}
                  <div className="relative">
                    <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                      ₹
                    </span>
                    <Input
                      aria-label="Package price"
                      inputMode="numeric"
                      placeholder="Per hour"
                      value={l.price}
                      onChange={(e) => setLength(i, { price: e.target.value.replace(/\D/g, "") })}
                      className="ps-6 font-mono tabular-nums placeholder:font-sans"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${lengthLabel(l.minutes)}`}
                    disabled={lengths.length === 1}
                    onClick={() =>
                      update((d) => ({
                        ...d,
                        lengths: d.lengths.filter((_, j) => j !== i),
                      }))
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                {lengthIssues.map((issue) => (
                  <p key={issue.path + issue.message} className="text-xs text-destructive">
                    {issue.message}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
        {lengths.length < MAX_LENGTHS && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() =>
              update((d) => ({
                ...d,
                lengths: [...d.lengths, { minutes: 60, label: "", sport: "", price: "" }],
              }))
            }
          >
            <PlusIcon data-icon="inline-start" />
            Add length
          </Button>
        )}
        {problem && <p className="text-xs text-destructive">{problem}</p>}
      </div>
    </>
  );
});

const lengthColumns = (multiSport: boolean) =>
  multiSport
    ? "grid-cols-[7.5rem_minmax(0,1fr)_8.5rem_7.5rem_2rem]"
    : "grid-cols-[7.5rem_minmax(0,1fr)_8rem_2rem]";

/**
 * A quarter-hour picker. A full dropdown costs far more to mount than a button, and the hours
 * tab can hold 56 of them, so each one is a look-alike button until the pointer or keyboard
 * reaches it. Its 96 options are built only while it is open.
 */
function TimeSelect({
  label,
  value,
  invalid,
  onChange,
}: {
  label: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const [live, setLive] = useState<"pointer" | "press" | "focus" | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // Reached by Tab: the stand-in had focus, so hand it to the real trigger.
  useEffect(() => {
    if (live === "focus") trigger.current?.focus();
  }, [live]);

  const className = "w-24 font-mono tabular-nums";
  if (!live) {
    return (
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={false}
        aria-label={label}
        aria-invalid={invalid || undefined}
        data-size="sm"
        className={cn(selectTriggerClassName, className)}
        // A mouse hovers before it presses, so the real trigger is in place for the press.
        onPointerEnter={(e) => e.pointerType === "mouse" && setLive("pointer")}
        // Keyboard focus only: a tap also focuses, and swapping mid-tap would lose the tap.
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && setLive("focus")}
        // A tap (or any press that still reaches this stand-in) opens the list once it ends.
        onClick={() => setLive("press")}
      >
        <span data-slot="select-value" className="flex flex-1 text-start">
          {value}
        </span>
        <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <Select defaultOpen={live === "press"} value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger
        ref={trigger}
        size="sm"
        aria-label={label}
        aria-invalid={invalid || undefined}
        className={className}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="max-h-64">
        {QUARTER_HOURS.map((t) => (
          <SelectItem key={t} value={t} className="font-mono tabular-nums">
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ScheduleCard({
  court,
  schedule,
  manager,
}: {
  court: Court;
  schedule: CourtSchedule;
  manager: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <Widget>
      <WidgetHeader
        title="Hours & booking lengths"
        icon={Clock3Icon}
        action={
          manager && (
            <Button size="sm" variant="outline" className="me-2" onClick={() => setEditing(true)}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-4 px-(--card-spacing) pb-(--card-spacing) text-sm">
        <div className="flex flex-wrap gap-1.5">
          {schedule.durations.map((d) => (
            <Badge key={`${d.minutes}-${d.sport}`} variant="secondary">
              {d.label ? `${d.label} · ` : ""}
              {lengthLabel(d.minutes)}
              {d.sport ? ` · ${SPORT_LABEL[d.sport]}` : ""}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Bookings can start every {schedule.startStepMinutes} minutes.
        </p>
        {schedule.alwaysOpen ? (
          <p>Open 24 hours, every day.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {schedule.days.map((day) => (
              <li key={day.weekday} className="grid grid-cols-[2.5rem_1fr] gap-2">
                <span className="text-muted-foreground">{WEEKDAY_SHORT[day.weekday - 1]}</span>
                <span className="font-mono text-xs tabular-nums">
                  {day.windows.length === 0 ? (
                    <span className="text-muted-foreground">Closed</span>
                  ) : (
                    day.windows.map((w) => `${w.opens}–${w.closes}`).join(", ")
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && (
        <ScheduleDialog court={court} schedule={schedule} open onOpenChange={setEditing} />
      )}
    </Widget>
  );
}
