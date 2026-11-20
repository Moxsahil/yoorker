import { useQuery } from "@tanstack/react-query";
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
import { toast } from "@/components/ui/toast";
import { Segmented } from "@/kit/ui-patterns/segmented";
import { api } from "@/lib/api";
import type { DemoBooking, PaymentLabel } from "@/lib/demo-data";
import { useManualBookings } from "@/lib/manual-bookings";
import { cn } from "@/lib/utils";
import {
  dayLabel,
  inr,
  lengthLabel,
  todayAt,
  type Court,
  type CourtSchedule,
  type CourtSlots,
  type Slot,
} from "@/lib/yoorker";

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** 10 digits starting 6-9, the shape of an Indian mobile number. */
const validPhone = (digits: string) => /^[6-9]\d{9}$/.test(digits);

/**
 * Add a booking by hand, for someone standing at the counter. Lengths, free start times and
 * prices come from the real API (schedule, slots, pricing); the booking itself is kept in this
 * browser until the bookings API arrives in Sprint 3.
 */
export function NewBookingDialog({
  open,
  onOpenChange,
  courts,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courts: Court[];
  /** Bookings already on the sheet, so a start time that clashes with one is not offered. */
  existing: DemoBooking[];
}) {
  const active = courts.filter((c) => c.isActive);
  const dates = Array.from({ length: 7 }, (_, i) => todayAt(undefined, i));
  const add = useManualBookings((state) => state.add);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [courtId, setCourtId] = useState(active[0]?.id ?? "");
  const [date, setDate] = useState(dates[0]!);
  const [length, setLength] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentLabel>("PAID");
  const [tried, setTried] = useState(false);

  const court = active.find((c) => c.id === courtId) ?? active[0];
  const schedule = useQuery({
    queryKey: ["schedule", court?.id],
    queryFn: () => api<CourtSchedule>(`/courts/${court!.id}/schedule`),
    enabled: open && Boolean(court),
  });
  const durations = schedule.data?.durations ?? [];
  // "minutes|sport", so two lengths of the same time for different sports stay apart.
  const chosen = durations.find((d) => `${d.minutes}|${d.sport ?? ""}` === length) ?? durations[0];
  const slots = useQuery({
    queryKey: ["slots", court?.id, date, chosen?.minutes, chosen?.sport],
    queryFn: () =>
      api<CourtSlots>(
        `/courts/${court!.id}/slots?date=${date}&minutes=${chosen!.minutes}${chosen!.sport ? `&sport=${chosen!.sport}` : ""}`,
      ),
    enabled: open && Boolean(court && chosen),
    retry: false,
  });

  const clashes = (slot: Slot) => {
    const from = minutesOf(slot.start);
    const to = from + (chosen?.minutes ?? 0);
    return existing.some(
      (b) =>
        b.court === court?.name &&
        b.date === date &&
        b.booking !== "CANCELLED" &&
        minutesOf(b.start) < to &&
        from < minutesOf(b.start) + b.minutes,
    );
  };
  const shown = (slots.data?.slots ?? []).filter((s) => s.status !== "PAST");
  const open_ = (slot: Slot) => slot.status === "FREE" && !clashes(slot);
  const picked = shown.find((s) => s.start === start && open_(s));

  const digits = phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  const nameError = tried && !name.trim() ? "Enter the customer's name." : null;
  const phoneError = tried && !validPhone(digits) ? "Enter a 10-digit mobile number." : null;
  const slotError = tried && !picked ? "Pick a start time." : null;

  const reset = () => {
    setName("");
    setPhone("");
    setStart(null);
    setPayment("PAID");
    setTried(false);
  };

  const save = () => {
    setTried(true);
    if (!name.trim() || !validPhone(digits) || !picked || !court || !chosen) return;
    const booking = add({
      customer: name.trim(),
      phone: `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`,
      court: court.name,
      date,
      start: picked.start,
      minutes: chosen.minutes,
      pricePaise: picked.pricePaise ?? 0,
      booking: "CONFIRMED",
      payment,
      source: "WALK_IN",
    });
    toast.add({
      type: "success",
      title: `Booked ${court.name} for ${booking.customer}`,
      description: `${date === dates[0] ? "Today" : dayLabel(date)}, ${picked.start}–${picked.end} · ${inr(booking.pricePaise)} ${payment === "PAID" ? "paid" : "to collect"}`,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New booking</DialogTitle>
          <DialogDescription>
            For a walk-in or a phone call. Free times and prices come from your court settings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="nb-name">Customer name</Label>
              <Input
                id="nb-name"
                autoComplete="off"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={Boolean(nameError)}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nb-phone">Mobile number</Label>
              <div className="flex">
                <span className="flex items-center rounded-s-md border border-e-0 bg-muted px-2.5 font-mono text-sm text-muted-foreground">
                  +91
                </span>
                <Input
                  id="nb-phone"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="10-digit number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-s-none font-mono tabular-nums"
                  aria-invalid={Boolean(phoneError)}
                />
              </div>
              {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="nb-court">Court</Label>
              <NativeSelect
                id="nb-court"
                className="w-full"
                value={court?.id ?? ""}
                onChange={(e) => {
                  setCourtId(e.target.value);
                  setLength(null);
                  setStart(null);
                }}
              >
                {active.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nb-date">Date</Label>
              <NativeSelect
                id="nb-date"
                className="w-full"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setStart(null);
                }}
              >
                {dates.map((d, i) => (
                  <NativeSelectOption key={d} value={d}>
                    {i === 0 ? `Today, ${dayLabel(d)}` : dayLabel(d)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nb-length">Length</Label>
              <NativeSelect
                id="nb-length"
                className="w-full"
                value={chosen ? `${chosen.minutes}|${chosen.sport ?? ""}` : ""}
                onChange={(e) => {
                  setLength(e.target.value);
                  setStart(null);
                }}
                disabled={durations.length === 0}
              >
                {durations.map((d) => (
                  <NativeSelectOption
                    key={`${d.minutes}|${d.sport ?? ""}`}
                    value={`${d.minutes}|${d.sport ?? ""}`}
                  >
                    {d.label ?? lengthLabel(d.minutes)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label>Start time</Label>
              <span className="text-xs text-muted-foreground">Crossed out = already taken</span>
            </div>
            {schedule.isSuccess && durations.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                This court has no booking lengths yet. Add them in Availability &amp; pricing.
              </p>
            ) : slots.isError ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                {(slots.error as Error).message}
              </p>
            ) : !slots.data ? (
              <div className="h-24 animate-pulse rounded-lg bg-muted" />
            ) : shown.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                No start times left on this day. Try another date or court.
              </p>
            ) : (
              <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-6">
                {shown.map((slot) => {
                  const free = open_(slot);
                  const selected = picked?.start === slot.start;
                  return (
                    <button
                      key={slot.start}
                      type="button"
                      disabled={!free}
                      aria-pressed={selected}
                      onClick={() => setStart(slot.start)}
                      className={cn(
                        "rounded-md border px-2 py-1.5 font-mono text-sm tabular-nums transition-colors",
                        free
                          ? "hover:border-primary/60 hover:bg-primary/5"
                          : "cursor-not-allowed border-transparent bg-muted/50 text-muted-foreground/60 line-through",
                        selected &&
                          "border-primary bg-primary text-primary-foreground hover:bg-primary",
                      )}
                    >
                      {slot.start}
                    </button>
                  );
                })}
              </div>
            )}
            {slotError && <p className="text-xs text-destructive">{slotError}</p>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">
                {picked
                  ? `${picked.start}–${picked.end} · ${chosen ? lengthLabel(chosen.minutes) : ""}${picked.ruleName ? ` · ${picked.ruleName}` : ""}`
                  : "Pick a start time to see the price"}
              </span>
              <span className="font-mono text-xl font-semibold tabular-nums">
                {picked?.pricePaise != null ? inr(picked.pricePaise) : "—"}
              </span>
            </div>
            <Segmented<PaymentLabel>
              aria-label="Payment"
              className="w-auto shrink-0"
              value={payment}
              onChange={setPayment}
              options={[
                { value: "PAID", label: "Paid now" },
                { value: "NOT_PAID", label: "Pay later" },
              ]}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Add booking</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
