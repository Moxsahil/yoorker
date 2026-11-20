import { useQueryClient } from "@tanstack/react-query";
import { IndianRupeeIcon, MinusIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { Segmented } from "@/kit/ui-patterns/segmented";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  dayLabel,
  inr,
  lengthLabel,
  WEEKDAY_SHORT,
  type CourtDuration,
  type CourtPrices,
  type PriceRule,
} from "@/lib/yoorker";

/** Every quarter hour, the steps the API accepts. */
const TIMES = Array.from({ length: 96 }, (_, i) => {
  const m = i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

const DAY_PRESETS: { label: string; days: number[] }[] = [
  { label: "Every day", days: [1, 2, 3, 4, 5, 6, 7] },
  { label: "Mon–Fri", days: [1, 2, 3, 4, 5] },
  { label: "Sat, Sun", days: [6, 7] },
];

function daysLabel(weekdays: number[], onDate: string | null): string {
  if (onDate) return dayLabel(onDate);
  const preset = DAY_PRESETS.find((p) => p.days.join() === weekdays.join());
  return preset?.label ?? weekdays.map((d) => WEEKDAY_SHORT[d - 1]).join(", ");
}

const errorText = (error: unknown) => (error instanceof ApiError ? error.message : String(error));

/** Rupees typed by the owner → paise for the API; whole rupees only. */
const toPaise = (rupees: string) => {
  const n = Number(rupees.replace(/[,\s₹]/g, ""));
  return Number.isInteger(n) && n >= 0 ? n * 100 : null;
};

function RupeeField({
  id,
  value,
  onChange,
  step,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  step: number;
}) {
  const nudge = (by: number) => {
    const now = Number(value.replace(/[,\s₹]/g, "")) || 0;
    onChange(String(Math.max(0, now + by)));
  };
  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon"
        aria-label={`₹${step} less`}
        onClick={() => nudge(-step)}
      >
        <MinusIcon />
      </Button>
      <div className="relative flex-1">
        <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          ₹
        </span>
        <Input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
          className="ps-7 text-center font-mono text-base tabular-nums"
        />
      </div>
      <Button
        variant="outline"
        size="icon"
        aria-label={`₹${step} more`}
        onClick={() => nudge(step)}
      >
        <PlusIcon />
      </Button>
    </div>
  );
}

/** Add or change one price rule. */
function RuleDialog({
  rule,
  durations,
  open,
  onOpenChange,
  onSave,
  onDelete,
}: {
  rule: PriceRule | null;
  durations: CourtDuration[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (rule: PriceRule) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
}) {
  const lengths = [...new Set(durations.map((d) => d.minutes))];
  const [name, setName] = useState(rule?.name ?? "");
  const [onDate, setOnDate] = useState<string | null>(rule?.onDate ?? null);
  const [weekdays, setWeekdays] = useState<number[]>(
    rule?.weekdays.length ? rule.weekdays : [1, 2, 3, 4, 5, 6, 7],
  );
  const [from, setFrom] = useState(rule?.from ?? "18:00");
  const [to, setTo] = useState(rule?.to ?? "22:00");
  const [unit, setUnit] = useState<PriceRule["unit"]>(
    rule?.unit ?? (lengths.length === 1 && lengths[0]! > 120 ? "PER_BOOKING" : "PER_HOUR"),
  );
  const [minutes, setMinutes] = useState<number | null>(
    rule?.minutes ?? (unit === "PER_BOOKING" ? (lengths[0] ?? null) : null),
  );
  const [price, setPrice] = useState(rule ? String(rule.pricePaise / 100) : "");
  const [priority, setPriority] = useState(rule?.priority ?? 0);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const paise = toPaise(price);
  const wholeSlot = unit === "PER_BOOKING";
  const problem = !name.trim()
    ? "Give the rule a name, e.g. Weekend evening."
    : !onDate && weekdays.length === 0
      ? "Pick at least one day."
      : paise === null || price === ""
        ? "Enter a price in whole rupees."
        : wholeSlot && !minutes
          ? "A price for the whole slot needs a slot length."
          : null;

  const save = async () => {
    if (problem) return;
    setBusy(true);
    const ok = await onSave({
      name: name.trim(),
      weekdays: onDate ? [] : [...weekdays].sort(),
      onDate,
      from,
      to,
      minutes,
      unit,
      pricePaise: paise!,
      priority,
    });
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  const overnight = to <= from;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? `Edit ${rule.name}` : "Add a price"}</DialogTitle>
          <DialogDescription>
            Players are charged this price for bookings in these hours.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              placeholder="e.g. Weekend evening"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Days</Label>
              <Segmented<"week" | "date">
                aria-label="Repeat"
                className="w-auto"
                value={onDate ? "date" : "week"}
                onChange={(v) =>
                  setOnDate(v === "date" ? new Date().toISOString().slice(0, 10) : null)
                }
                options={[
                  { value: "week", label: "Every week" },
                  { value: "date", label: "One date" },
                ]}
              />
            </div>
            {onDate ? (
              <Input
                type="date"
                value={onDate}
                onChange={(e) => setOnDate(e.target.value || null)}
                className="w-48"
              />
            ) : (
              <>
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
                          setWeekdays((list) =>
                            on ? list.filter((d) => d !== day) : [...list, day],
                          )
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
                <div className="flex gap-3 text-xs">
                  {DAY_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setWeekdays(preset.days)}
                      className="text-muted-foreground hover:text-primary"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rule-from">From</Label>
              <NativeSelect
                id="rule-from"
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
              <Label htmlFor="rule-to">To</Label>
              <NativeSelect
                id="rule-to"
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
            {overnight && (
              <p className="col-span-2 -mt-2 text-xs text-muted-foreground">
                Runs past midnight, {from} to {to} the next morning.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Charge</Label>
            <Segmented<PriceRule["unit"]>
              aria-label="Charge"
              value={unit}
              onChange={(next) => {
                setUnit(next);
                if (next === "PER_BOOKING" && !minutes) setMinutes(lengths[0] ?? null);
              }}
              options={[
                { value: "PER_HOUR", label: "Per hour" },
                { value: "PER_BOOKING", label: "For the whole slot" },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rule-length">Slot length</Label>
              <NativeSelect
                id="rule-length"
                className="w-full"
                value={minutes === null ? "" : String(minutes)}
                onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : null)}
              >
                {!wholeSlot && <NativeSelectOption value="">Any length</NativeSelectOption>}
                {lengths.map((m) => (
                  <NativeSelectOption key={m} value={String(m)}>
                    {lengthLabel(m)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                Lengths come from Hours &amp; booking lengths.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rule-priority">Priority</Label>
              <Input
                id="rule-priority"
                type="number"
                min={0}
                max={100}
                value={priority}
                onChange={(e) =>
                  setPriority(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                }
                className="font-mono tabular-nums"
              />
              <p className="text-xs text-muted-foreground">Higher wins when two prices overlap.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="rule-price">
              Price {wholeSlot ? "for the whole slot" : "per hour"}
            </Label>
            <RupeeField
              id="rule-price"
              value={price}
              onChange={setPrice}
              step={wholeSlot ? 500 : 100}
            />
          </div>

          {problem && name && <p className="text-xs text-destructive">{problem}</p>}
        </div>

        <DialogFooter className="sm:justify-between">
          {onDelete ? (
            <Button
              variant={confirmDelete ? "destructive" : "ghost"}
              className={cn(!confirmDelete && "text-destructive")}
              disabled={busy}
              onClick={async () => {
                if (!confirmDelete) return setConfirmDelete(true);
                setBusy(true);
                const ok = await onDelete();
                setBusy(false);
                if (ok) onOpenChange(false);
              }}
            >
              <Trash2Icon data-icon="inline-start" />
              {confirmDelete ? "Yes, delete it" : "Delete"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={busy || Boolean(problem)} onClick={save}>
              {rule ? "Save price" : "Add price"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The court's prices, editable by owners and managers. Every change sends the whole list to
 * PUT /courts/:id/prices, which checks it and replaces the old one.
 */
export function PricesCard({
  courtId,
  prices,
  durations,
  manager,
  className,
}: {
  courtId: string;
  prices: CourtPrices;
  durations: CourtDuration[];
  manager: boolean;
  className?: string;
}) {
  const client = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; index: number | null }>({
    open: false,
    index: null,
  });
  const [editingBase, setEditingBase] = useState(false);
  const [base, setBase] = useState("");

  const put = async (next: Pick<CourtPrices, "basePricePerHourPaise" | "rules">, done: string) => {
    try {
      await api(`/courts/${courtId}/prices`, {
        method: "PUT",
        body: {
          basePricePerHourPaise: next.basePricePerHourPaise,
          rules: next.rules,
        },
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["prices", courtId] }),
        client.invalidateQueries({ queryKey: ["slots", courtId] }),
      ]);
      toast.add({ type: "success", title: done });
      return true;
    } catch (error) {
      toast.add({
        type: "error",
        title: "Couldn't save the prices",
        description: errorText(error),
      });
      return false;
    }
  };

  const saveRule = (rule: PriceRule) => {
    const rules = [...prices.rules];
    if (dialog.index === null) rules.push(rule);
    else rules[dialog.index] = rule;
    return put(
      { basePricePerHourPaise: prices.basePricePerHourPaise, rules },
      dialog.index === null ? `${rule.name} added` : `${rule.name} saved`,
    );
  };

  const deleteRule = () => {
    const index = dialog.index!;
    const name = prices.rules[index]!.name;
    return put(
      {
        basePricePerHourPaise: prices.basePricePerHourPaise,
        rules: prices.rules.filter((_, i) => i !== index),
      },
      `${name} deleted`,
    );
  };

  const saveBase = async () => {
    const paise = base.trim() === "" ? null : toPaise(base);
    if (base.trim() !== "" && paise === null) return;
    const ok = await put({ basePricePerHourPaise: paise, rules: prices.rules }, "Base price saved");
    if (ok) setEditingBase(false);
  };

  return (
    <Widget className={className}>
      <WidgetHeader
        title="Prices"
        icon={IndianRupeeIcon}
        action={
          manager && (
            <Button
              size="sm"
              className="me-2"
              onClick={() => setDialog({ open: true, index: null })}
            >
              <PlusIcon data-icon="inline-start" />
              Add price
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-3 px-(--card-spacing)">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">Base price</span>
          {editingBase ? (
            <>
              <div className="w-56">
                <RupeeField id="base-price" value={base} onChange={setBase} step={100} />
              </div>
              <span className="text-muted-foreground">per hour</span>
              <Button size="sm" onClick={saveBase}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingBase(false)}>
                Cancel
              </Button>
              <span className="basis-full text-xs text-muted-foreground">
                Leave it empty and times without a price can&apos;t be booked.
              </span>
            </>
          ) : (
            <>
              <span className="font-mono font-medium tabular-nums">
                {prices.basePricePerHourPaise !== null
                  ? `${inr(prices.basePricePerHourPaise)}/h`
                  : "None"}
              </span>
              <span className="text-xs text-muted-foreground">when no price below matches</span>
              {manager && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ms-auto"
                  onClick={() => {
                    setBase(
                      prices.basePricePerHourPaise !== null
                        ? String(prices.basePricePerHourPaise / 100)
                        : "",
                    );
                    setEditingBase(true);
                  }}
                >
                  <PencilIcon data-icon="inline-start" />
                  Change
                </Button>
              )}
            </>
          )}
        </div>

        <div className="-mx-3 overflow-x-auto">
          <Table className="min-w-[40rem] [&_td]:px-3 [&_td]:py-3 [&_td:first-child]:rounded-s-lg [&_td:last-child]:rounded-e-lg [&_th]:h-9 [&_th]:px-3">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Price</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Length</TableHead>
                <TableHead className="text-end">Amount</TableHead>
                {manager && (
                  <TableHead className="w-12">
                    <span className="sr-only">Edit</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {prices.rules.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    No prices yet. Every booking is charged the base price.
                  </TableCell>
                </TableRow>
              )}
              {prices.rules.map((rule, index) => (
                <TableRow
                  key={`${rule.name}-${index}`}
                  className={cn("border-border/60", manager && "cursor-pointer hover:bg-muted/40")}
                  onClick={() => manager && setDialog({ open: true, index })}
                >
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {daysLabel(rule.weekdays, rule.onDate)}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {rule.from}–{rule.to}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {rule.minutes ? lengthLabel(rule.minutes) : "Any"}
                  </TableCell>
                  <TableCell className="text-end font-mono tabular-nums">
                    {inr(rule.pricePaise)}
                    <span className="text-muted-foreground">
                      {rule.unit === "PER_HOUR" ? "/h" : " per slot"}
                    </span>
                  </TableCell>
                  {manager && (
                    <TableCell className="text-end">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${rule.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDialog({ open: true, index });
                        }}
                      >
                        <PencilIcon />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <RuleDialog
        key={`${dialog.index ?? "new"}-${dialog.open}`}
        rule={dialog.index === null ? null : prices.rules[dialog.index]!}
        durations={durations}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onSave={saveRule}
        onDelete={dialog.index === null ? undefined : deleteRule}
      />
    </Widget>
  );
}
