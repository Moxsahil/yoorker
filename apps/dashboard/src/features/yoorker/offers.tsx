import { PlusIcon, TicketPercentIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { PageHeader } from "@/kit/ui-patterns/page-header";
import { Segmented } from "@/kit/ui-patterns/segmented";
import { StatusBadge, type Tone } from "@/kit/ui-patterns/status-badge";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import { demoOffers, offerState, type Offer, type OfferState } from "@/lib/demo-team";
import { addDays } from "@/lib/period";
import { useCurrentVenue } from "@/lib/session";
import { cn } from "@/lib/utils";
import { dayLabel, inr, todayAt, WEEKDAY_SHORT } from "@/lib/yoorker";

import { SampleBadge } from "./common";
import { OffersSkeleton } from "./page-skeletons";

const STATE: Record<OfferState, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Running", tone: "success" },
  SCHEDULED: { label: "Starts later", tone: "info" },
  PAUSED: { label: "Paused", tone: "muted" },
  ENDED: { label: "Ended", tone: "muted" },
};

type Filter = "all" | "live" | "ended";

const TIMES = Array.from({ length: 96 }, (_, i) => {
  const m = i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

const daysText = (days: number[]) => {
  const key = [...days].sort().join();
  if (key === "1,2,3,4,5,6,7") return "Every day";
  if (key === "1,2,3,4,5") return "Mon–Fri";
  if (key === "6,7") return "Sat, Sun";
  return days.map((d) => WEEKDAY_SHORT[d - 1]).join(", ");
};

const hoursText = (o: Offer) => (o.from === o.to ? "All day" : `${o.from}–${o.to}`);

const discountText = (o: Offer) => (o.kind === "PERCENT" ? `${o.value}% off` : `₹${o.value} off`);

function OfferDialog({
  open,
  onOpenChange,
  courts,
  today,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courts: string[];
  today: string;
  onCreate: (offer: Offer) => void;
}) {
  const [name, setName] = useState("");
  const [withCode, setWithCode] = useState(false);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<Offer["kind"]>("PERCENT");
  const [value, setValue] = useState("10");
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [from, setFrom] = useState("06:00");
  const [to, setTo] = useState("12:00");
  const [allCourts, setAllCourts] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [validFrom, setValidFrom] = useState(today);
  const [validTo, setValidTo] = useState(addDays(today, 30));
  const [limit, setLimit] = useState("");
  const [tried, setTried] = useState(false);

  const amount = Number(value);
  const problem = !name.trim()
    ? "Give the offer a name."
    : withCode && !/^[A-Z0-9]{4,15}$/.test(code)
      ? "Use a code of 4 to 15 letters or numbers, e.g. MORNING20."
      : !Number.isInteger(amount) || amount <= 0 || (kind === "PERCENT" && amount > 90)
        ? kind === "PERCENT"
          ? "Use a whole percent from 1 to 90."
          : "Use a whole rupee amount above 0."
        : weekdays.length === 0
          ? "Pick at least one day."
          : !allCourts && picked.length === 0
            ? "Pick at least one court."
            : validTo && validTo < validFrom
              ? "The end date is before the start date."
              : null;

  const create = () => {
    setTried(true);
    if (problem) return;
    onCreate({
      id: `o${Date.now()}`,
      name: name.trim(),
      code: withCode ? code : null,
      kind,
      value: amount,
      weekdays: [...weekdays].sort(),
      from,
      to,
      courts: allCourts ? null : picked,
      validFrom,
      validTo: validTo || null,
      used: 0,
      limit: limit ? Number(limit) : null,
      givenPaise: 0,
      enabled: true,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create an offer</DialogTitle>
          <DialogDescription>
            A discount players get at checkout, on the days and hours you choose.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto pe-1">
          <div className="flex flex-col gap-2">
            <Label htmlFor="of-name">Name</Label>
            <Input
              id="of-name"
              placeholder="e.g. Weekday morning"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>How players get it</Label>
            <Segmented<"auto" | "code">
              aria-label="How players get it"
              value={withCode ? "code" : "auto"}
              onChange={(v) => setWithCode(v === "code")}
              options={[
                { value: "auto", label: "Applied automatically" },
                { value: "code", label: "With a code" },
              ]}
            />
            {withCode && (
              <Input
                placeholder="MORNING20"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))}
                className="font-mono tracking-wide uppercase"
                maxLength={15}
              />
            )}
          </div>

          <div className="grid grid-cols-[auto_1fr] items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label>Discount</Label>
              <Segmented<Offer["kind"]>
                aria-label="Discount type"
                className="w-auto"
                value={kind}
                onChange={setKind}
                options={[
                  { value: "PERCENT", label: "% off" },
                  { value: "FLAT", label: "₹ off" },
                ]}
              />
            </div>
            <div className="relative">
              <Input
                aria-label="Discount amount"
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
                className="pe-8 font-mono tabular-nums"
              />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {kind === "PERCENT" ? "%" : "₹"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Days</Label>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAY_SHORT.map((label, i) => {
                const day = i + 1;
                const on = weekdays.includes(day);
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setWeekdays((list) => (on ? list.filter((d) => d !== day) : [...list, day]))
                    }
                    className={cn(
                      "rounded-md border py-1.5 text-sm transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="of-from">From</Label>
              <NativeSelect
                id="of-from"
                className="w-full font-mono"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              >
                {TIMES.map((t) => (
                  <NativeSelectOption key={t} value={t}>
                    {t}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="of-to">To</Label>
              <NativeSelect
                id="of-to"
                className="w-full font-mono"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              >
                {TIMES.map((t) => (
                  <NativeSelectOption key={t} value={t}>
                    {t}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <p className="col-span-2 -mt-2 text-xs text-muted-foreground">
              {from === to
                ? "Same start and end: the whole day."
                : to < from
                  ? `Runs past midnight, ${from} to ${to} the next morning.`
                  : "Bookings that start in these hours get the discount."}
            </p>
          </div>

          {courts.length > 1 && (
            <div className="flex flex-col gap-2">
              <Label>Courts</Label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={allCourts} onCheckedChange={(v) => setAllCourts(Boolean(v))} />
                Every court
              </label>
              {!allCourts && (
                <div className="grid grid-cols-2 gap-2 ps-6">
                  {courts.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={picked.includes(c)}
                        onCheckedChange={(on) =>
                          setPicked((list) => (on ? [...list, c] : list.filter((x) => x !== c)))
                        }
                      />
                      {c}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="of-start">Starts</Label>
              <Input
                id="of-start"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="of-end">Ends</Label>
              <Input
                id="of-end"
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="of-limit">Use limit</Label>
              <Input
                id="of-limit"
                inputMode="numeric"
                placeholder="No limit"
                value={limit}
                onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))}
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          {tried && problem && <p className="text-xs text-destructive">{problem}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create}>Create offer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OffersPage() {
  const { courts, loading } = useCurrentVenue();
  const today = todayAt();
  const courtNames = useMemo(() => courts.map((c) => c.name), [courts]);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const list = offers ?? demoOffers(today, courtNames);

  const live = list.filter((o) => ["ACTIVE", "SCHEDULED"].includes(offerState(o, today)));
  const rows = list.filter((o) => {
    const state = offerState(o, today);
    if (filter === "live") return state !== "ENDED";
    if (filter === "ended") return state === "ENDED";
    return true;
  });
  const given = list.reduce((s, o) => s + o.givenPaise, 0);
  const uses = list.reduce((s, o) => s + o.used, 0);

  if (loading) return <OffersSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Offers & discounts"
        description="Fill quiet hours and bring players back with discounts you control."
        meta={<SampleBadge sprint="Sprint 9" />}
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon data-icon="inline-start" />
            Create offer
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Running now",
            value: String(list.filter((o) => offerState(o, today) === "ACTIVE").length),
            caption: `${live.length - list.filter((o) => offerState(o, today) === "ACTIVE").length} more starting later`,
          },
          {
            label: "Times used",
            value: uses.toLocaleString("en-IN"),
            caption: "bookings that got a discount",
          },
          {
            label: "Discount given",
            value: inr(given),
            caption: "money players saved, all time",
          },
        ].map((stat) => (
          <Widget key={stat.label} className="gap-1.5">
            <span className="px-(--card-spacing) text-sm text-muted-foreground">{stat.label}</span>
            <span className="px-(--card-spacing) font-mono text-2xl font-semibold tabular-nums">
              {stat.value}
            </span>
            <span className="px-(--card-spacing) text-xs text-muted-foreground">
              {stat.caption}
            </span>
          </Widget>
        ))}
      </div>

      <Widget>
        <WidgetHeader
          title="Offers"
          icon={TicketPercentIcon}
          action={
            <Segmented<Filter>
              aria-label="Which offers"
              className="me-2 w-auto"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "live", label: "Current" },
                { value: "ended", label: "Ended" },
              ]}
            />
          }
        />
        <div className="overflow-x-auto px-[calc(var(--card-spacing)-0.75rem)]">
          <Table className="min-w-[56rem] table-fixed [&_td]:px-3 [&_td]:py-3 [&_td:first-child]:rounded-s-lg [&_td:last-child]:rounded-e-lg [&_th]:h-9 [&_th]:px-3">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[22%]">Offer</TableHead>
                <TableHead className="w-[11%]">Discount</TableHead>
                <TableHead className="w-[20%]">When</TableHead>
                <TableHead className="w-[16%]">Valid</TableHead>
                <TableHead className="w-[15%]">Used</TableHead>
                <TableHead className="w-[10%]">Status</TableHead>
                <TableHead className="w-[6%] text-end">On</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No offers here.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((o) => {
                const state = offerState(o, today);
                const share = o.limit !== null ? Math.min(1, o.used / o.limit) : null;
                return (
                  <TableRow key={o.id} className="border-border/60 hover:bg-muted/40">
                    <TableCell>
                      <span className="block truncate font-medium">{o.name}</span>
                      {o.code ? (
                        <span className="mt-1 inline-block rounded border border-dashed px-1.5 py-0.5 font-mono text-xs tracking-wide">
                          {o.code}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Applied automatically</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono font-medium tabular-nums">
                      {discountText(o)}
                    </TableCell>
                    <TableCell>
                      <span className="block text-sm">
                        {daysText(o.weekdays)}, {hoursText(o)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {o.courts === null ? "Every court" : o.courts.join(", ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="block">
                        {o.validFrom > today ? "From " : "Since "}
                        {dayLabel(o.validFrom)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {o.validTo ? `Until ${dayLabel(o.validTo)}` : "No end date"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block font-mono text-sm tabular-nums">
                        {o.used}
                        {o.limit !== null && (
                          <span className="text-muted-foreground"> / {o.limit}</span>
                        )}
                      </span>
                      {share !== null ? (
                        <span className="mt-1.5 block h-1 w-full max-w-28 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${share * 100}%` }}
                          />
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {inr(o.givenPaise)} saved
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={STATE[state].tone}>{STATE[state].label}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-end">
                      <Switch
                        checked={o.enabled && state !== "ENDED"}
                        disabled={state === "ENDED"}
                        aria-label={`${o.name} on`}
                        onCheckedChange={(on) => {
                          setOffers(list.map((x) => (x.id === o.id ? { ...x, enabled: on } : x)));
                          toast.add({
                            type: "success",
                            title: on ? `${o.name} is on` : `${o.name} paused`,
                          });
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Widget>

      <OfferDialog
        key={String(creating)}
        open={creating}
        onOpenChange={setCreating}
        courts={courtNames}
        today={today}
        onCreate={(offer) => {
          setOffers([offer, ...list]);
          toast.add({
            type: "success",
            title: `${offer.name} created`,
            description: `${discountText(offer)}, ${daysText(offer.weekdays)}, ${hoursText(offer)}.`,
          });
        }}
      />
    </div>
  );
}
