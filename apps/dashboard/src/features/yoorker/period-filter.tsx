import { CalendarIcon } from "lucide-react";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useState } from "react";
import type { DateRange as DayRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/kit/ui-patterns/segmented";
import { SAMPLE_HISTORY_DAYS } from "@/lib/demo-data";
import {
  addDays,
  MAX_CUSTOM_DAYS,
  PERIOD_LABEL,
  PERIODS,
  previousOf,
  rangeLabel,
  resolvePeriod,
  type DateRange,
  type Period,
} from "@/lib/period";

const toDate = (iso: string) =>
  new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function usePeriod(today: string) {
  const [query, setQuery] = useQueryStates({
    period: parseAsStringLiteral(PERIODS).withDefault("7d"),
    from: parseAsString,
    to: parseAsString,
  });
  const range = resolvePeriod(
    query.period,
    today,
    query.from && query.to ? { from: query.from, to: query.to } : undefined,
  );
  return {
    period: query.period,
    range,
    previous: previousOf(range),
    setPeriod: (period: Period) =>
      setQuery(
        period === "custom"
          ? { period, from: range.from, to: range.to }
          : { period, from: null, to: null },
      ),
    setCustom: (from: string, to: string) => setQuery({ period: "custom", from, to }),
  };
}

function CustomRange({
  range,
  today,
  onChange,
}: {
  range: DateRange;
  today: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayRange | undefined>({
    from: toDate(range.from),
    to: toDate(range.to),
  });
  const earliest = addDays(today, -(SAMPLE_HISTORY_DAYS - MAX_CUSTOM_DAYS));
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft({ from: toDate(range.from), to: toDate(range.to) });
      }}
    >
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <CalendarIcon data-icon="inline-start" />
        {rangeLabel(range)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={toDate(addDays(range.to, -31))}
          selected={draft}
          onSelect={(next) => {
            setDraft(next);
            if (next?.from && next.to && next.from.getTime() !== next.to.getTime()) {
              onChange(toIso(next.from), toIso(next.to));
              setOpen(false);
            }
          }}
          disabled={[{ after: toDate(today) }, { before: toDate(earliest) }]}
        />
        <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
          <span>Pick a start and an end date, up to {MAX_CUSTOM_DAYS} days.</span>
          {draft?.from && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                onChange(toIso(draft.from!), toIso(draft.from!));
                setOpen(false);
              }}
            >
              Only{" "}
              {draft.from.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PeriodFilter({
  today,
  state,
}: {
  today: string;
  state: ReturnType<typeof usePeriod>;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{rangeLabel(state.range)}</span>
        <span className="hidden sm:inline">
          {" "}
          · compared with{" "}
          <span className="text-foreground">
            {state.range.days === 1 ? "yesterday" : rangeLabel(state.previous)}
          </span>
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Period>
          aria-label="Period"
          className="w-auto shrink-0"
          value={state.period}
          onChange={state.setPeriod}
          options={PERIODS.map((value) => ({
            value,
            label: PERIOD_LABEL[value],
          }))}
        />
        {state.period === "custom" && (
          <CustomRange range={state.range} today={today} onChange={state.setCustom} />
        )}
      </div>
    </div>
  );
}
