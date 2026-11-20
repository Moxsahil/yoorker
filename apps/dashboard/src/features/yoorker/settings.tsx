import { useQueryClient } from "@tanstack/react-query";
import {
  BellIcon,
  BookOpenIcon,
  Building2Icon,
  CalendarCogIcon,
  CircleHelpIcon,
  LandmarkIcon,
  LaptopIcon,
  LifeBuoyIcon,
  MailIcon,
  MessageCircleIcon,
  PhoneIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UndoIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useRouter } from "@/kit/framework";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { PageHeader } from "@/kit/ui-patterns/page-header";
import { StatusBadge } from "@/kit/ui-patterns/status-badge";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import { api, ApiError } from "@/lib/api";
import { useCurrentVenue, useMe } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { Me } from "@/lib/yoorker";
import { DEV_NOTES } from "@/lib/dev-notes";

import { LiveBadge, SampleBadge } from "./common";

const SECTIONS = [
  { id: "business", label: "Business profile", icon: Building2Icon },
  { id: "account", label: "Your account", icon: UserIcon },
  { id: "payouts", label: "Tax & payouts", icon: LandmarkIcon },
  { id: "cancellation", label: "Cancellation & refunds", icon: UndoIcon },
  { id: "booking", label: "Booking preferences", icon: CalendarCogIcon },
  { id: "security", label: "Security", icon: ShieldCheckIcon },
  { id: "notifications", label: "Notifications", icon: BellIcon },
  { id: "help", label: "Help & support", icon: LifeBuoyIcon },
] as const;

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id?: string;
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** A row with a label and explanation on the left and a control on the right. */
function SettingRow({
  title,
  detail,
  children,
}: {
  title: string;
  detail: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Card footer: Save when something changed, otherwise a quiet "Saved". */
function SaveBar({
  dirty,
  onSave,
  onReset,
  disabled,
}: {
  dirty: boolean;
  onSave: () => void;
  onReset: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mx-(--card-spacing) mt-auto flex items-center justify-end gap-2 border-t pt-4">
      {dirty ? (
        <>
          <span className="me-auto text-xs text-muted-foreground">Unsaved changes</span>
          <Button variant="ghost" size="sm" onClick={onReset}>
            Undo
          </Button>
          <Button size="sm" onClick={onSave} disabled={disabled}>
            Save changes
          </Button>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">All changes saved</span>
      )}
    </div>
  );
}

/** Local form state with a saved copy, so a card knows when it has unsaved changes. */
function useDraft<T>(initial: T) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  return {
    draft,
    set: <K extends keyof T>(key: K, value: T[K]) => setDraft((d) => ({ ...d, [key]: value })),
    dirty: JSON.stringify(saved) !== JSON.stringify(draft),
    save: () => setSaved(draft),
    reset: () => setDraft(saved),
  };
}

function Section({
  id,
  title,
  icon,
  badge,
  className,
  children,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  badge?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // The wrapper carries the id, so the side list can jump and highlight.
    <section id={id} className={cn("scroll-mt-24", className)}>
      <Widget className="h-full">
        <WidgetHeader
          title={
            <span className="flex items-center gap-2">
              {title}
              {badge}
            </span>
          }
          icon={icon}
        />
        {children}
      </Widget>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Business profile
// ---------------------------------------------------------------------------

function BusinessCard() {
  const { venue, organisations } = useCurrentVenue();
  const org = organisations.find((o) => o.id === venue?.organisationId);
  const form = useDraft({
    name: org?.name ?? "Green Arena Sports",
    phone: "98111 00099",
    email: "bookings@greenarena.in",
    address: venue ? [venue.address, venue.pincode].filter(Boolean).join(" ") : "",
  });
  const { draft } = form;
  const emailError =
    draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)
      ? "Check the email address."
      : null;

  return (
    <Section id="business" title="Business profile" icon={Building2Icon} badge={<SampleBadge />}>
      <p className="-mt-2 px-(--card-spacing) text-sm text-muted-foreground">
        Shown to players on your booking page, receipts and invoices.
      </p>
      <div className="grid gap-4 px-(--card-spacing) sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field id="biz-name" label="Business name">
            <Input
              id="biz-name"
              value={draft.name}
              onChange={(e) => form.set("name", e.target.value)}
            />
          </Field>
        </div>
        <Field id="biz-phone" label="Contact number" hint="Players call this">
          <div className="flex">
            <span className="flex items-center rounded-s-md border border-e-0 bg-muted px-2.5 font-mono text-sm text-muted-foreground">
              +91
            </span>
            <Input
              id="biz-phone"
              inputMode="numeric"
              value={draft.phone}
              onChange={(e) => form.set("phone", e.target.value)}
              className="rounded-s-none font-mono tabular-nums"
            />
          </div>
        </Field>
        <Field
          id="biz-email"
          label="Email"
          hint="Receipts and payout reports go here"
          error={emailError}
        >
          <Input
            id="biz-email"
            type="email"
            value={draft.email}
            onChange={(e) => form.set("email", e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field id="biz-address" label="Registered address">
            <Textarea
              id="biz-address"
              rows={2}
              value={draft.address}
              onChange={(e) => form.set("address", e.target.value)}
            />
          </Field>
        </div>
      </div>
      <SaveBar
        dirty={form.dirty}
        disabled={Boolean(emailError) || !draft.name.trim()}
        onReset={form.reset}
        onSave={() => {
          form.save();
          toast.add({ type: "success", title: "Business profile saved" });
        }}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Your account (real API)
// ---------------------------------------------------------------------------

function AccountCard({ user }: { user: Me["user"] }) {
  const client = useQueryClient();
  const form = useDraft({ name: user.name ?? "", phone: user.phone ?? "" });

  const save = async () => {
    try {
      const body: Record<string, string> = {};
      if (form.draft.name.trim() && form.draft.name !== user.name) body.name = form.draft.name;
      if (form.draft.phone.trim() && form.draft.phone !== user.phone) body.phone = form.draft.phone;
      const updated = await api<Me>("/auth/me", { method: "PATCH", body });
      client.setQueryData(["me"], updated);
      form.save();
      toast.add({ type: "success", title: "Account saved" });
    } catch (error) {
      toast.add({
        type: "error",
        title: "Couldn't save",
        description: error instanceof ApiError ? error.message : String(error),
      });
    }
  };

  return (
    <Section id="account" title="Your account" icon={UserIcon} badge={<LiveBadge />}>
      <p className="-mt-2 px-(--card-spacing) text-sm text-muted-foreground">
        You sign in with this mobile number.
      </p>
      <div className="grid gap-4 px-(--card-spacing) sm:grid-cols-2">
        <Field id="acc-name" label="Your name">
          <Input
            id="acc-name"
            value={form.draft.name}
            onChange={(e) => form.set("name", e.target.value)}
          />
        </Field>
        <Field
          id="acc-phone"
          label="Mobile"
          hint={
            user.phone && (
              <StatusBadge tone={user.phoneVerified ? "success" : "warning"}>
                {user.phoneVerified ? "Verified" : "Not verified"}
              </StatusBadge>
            )
          }
        >
          <Input
            id="acc-phone"
            value={form.draft.phone}
            onChange={(e) => form.set("phone", e.target.value)}
            className="font-mono tabular-nums"
          />
        </Field>
      </div>
      <SaveBar dirty={form.dirty} onReset={form.reset} onSave={save} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Tax & payouts
// ---------------------------------------------------------------------------

/** 15 characters: state code, PAN, entity number, Z, checksum. */
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const BANKS: Record<string, string> = {
  HDFC: "HDFC Bank",
  ICIC: "ICICI Bank",
  SBIN: "State Bank of India",
  PUNB: "Punjab National Bank",
  UTIB: "Axis Bank",
  KKBK: "Kotak Mahindra Bank",
  BARB: "Bank of Baroda",
};

function PayoutsCard() {
  const form = useDraft({
    registered: true,
    gstin: "06ABCDE1234F1Z5",
    legalName: "Green Arena Sports Private Limited",
    holder: "GREEN ARENA SPORTS PVT LTD",
    account: "50200012345678",
    ifsc: "HDFC0001234",
  });
  const [editingBank, setEditingBank] = useState(false);
  const { draft } = form;

  const gstError =
    draft.registered && !GSTIN.test(draft.gstin)
      ? "A GSTIN is 15 characters, e.g. 06ABCDE1234F1Z5."
      : null;
  const ifscError =
    editingBank && !IFSC.test(draft.ifsc) ? "An IFSC is 11 characters, e.g. HDFC0001234." : null;
  const accountError =
    editingBank && !/^\d{9,18}$/.test(draft.account) ? "Account numbers are 9 to 18 digits." : null;
  const bank = BANKS[draft.ifsc.slice(0, 4)] ?? "Bank";

  return (
    <Section
      id="payouts"
      title="Tax & payouts"
      icon={LandmarkIcon}
      badge={<SampleBadge sprint="Sprint 7" />}
    >
      <div className="flex flex-col gap-5 px-(--card-spacing)">
        <SettingRow
          title="Registered for GST"
          detail="Turn off if your turnover is below the GST limit. Invoices then show no GST."
        >
          <Switch
            checked={draft.registered}
            onCheckedChange={(v) => form.set("registered", v)}
            aria-label="Registered for GST"
          />
        </SettingRow>
        <div className="grid gap-4 sm:grid-cols-2">
          {draft.registered && (
            <Field id="gstin" label="GSTIN" error={gstError}>
              <Input
                id="gstin"
                value={draft.gstin}
                maxLength={15}
                onChange={(e) => form.set("gstin", e.target.value.toUpperCase().trim())}
                className="font-mono tracking-wide uppercase"
              />
            </Field>
          )}
          <Field
            id="legal-name"
            label="Legal name"
            hint="Exactly as on your PAN or GST certificate"
          >
            <Input
              id="legal-name"
              value={draft.legalName}
              onChange={(e) => form.set("legalName", e.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Bank account for payouts</span>
          {editingBank ? (
            <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field id="holder" label="Account holder name">
                  <Input
                    id="holder"
                    value={draft.holder}
                    onChange={(e) => form.set("holder", e.target.value.toUpperCase())}
                  />
                </Field>
              </div>
              <Field id="account" label="Account number" error={accountError}>
                <Input
                  id="account"
                  inputMode="numeric"
                  value={draft.account}
                  onChange={(e) => form.set("account", e.target.value.replace(/\D/g, ""))}
                  className="font-mono tabular-nums"
                />
              </Field>
              <Field id="ifsc" label="IFSC" error={ifscError} hint={BANKS[draft.ifsc.slice(0, 4)]}>
                <Input
                  id="ifsc"
                  maxLength={11}
                  value={draft.ifsc}
                  onChange={(e) => form.set("ifsc", e.target.value.toUpperCase().trim())}
                  className="font-mono uppercase"
                />
              </Field>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                We send ₹1 to check the account before the next payout uses it.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <LandmarkIcon className="size-5 text-muted-foreground" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {bank} ·{" "}
                  <span className="font-mono tabular-nums">•••• {draft.account.slice(-4)}</span>
                  <StatusBadge tone="success">Verified</StatusBadge>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {draft.holder} · IFSC {draft.ifsc}
                </span>
              </span>
              <Button variant="outline" size="sm" onClick={() => setEditingBank(true)}>
                Change account
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Online payments are paid into this account every Monday, after refunds and
            Yoorker&apos;s commission.
          </p>
        </div>
      </div>
      <SaveBar
        dirty={form.dirty}
        disabled={Boolean(gstError || ifscError || accountError)}
        onReset={() => {
          form.reset();
          setEditingBank(false);
        }}
        onSave={() => {
          form.save();
          setEditingBank(false);
          toast.add({
            type: "success",
            title: "Tax & payout details saved",
            description: editingBank
              ? "The new account is checked before the next payout."
              : undefined,
          });
        }}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Cancellation & refunds
// ---------------------------------------------------------------------------

const FREE_WINDOWS = [
  { value: 24, label: "24 hours or more before" },
  { value: 12, label: "12 hours before" },
  { value: 6, label: "6 hours before" },
  { value: 0, label: "No free cancellation" },
];
const LATE_REFUNDS = [100, 75, 50, 25, 0];

function CancellationCard() {
  const form = useDraft({ freeHours: 24, lateRefund: 50 });
  const { freeHours, lateRefund } = form.draft;
  const free = freeHours > 0;

  return (
    <Section
      id="cancellation"
      title="Cancellation & refunds"
      icon={UndoIcon}
      badge={<SampleBadge sprint="Sprint 6" />}
    >
      <p className="-mt-2 px-(--card-spacing) text-sm text-muted-foreground">
        Your rules, shown to players before they pay. Changes apply to new bookings only.
      </p>
      <div className="flex flex-col gap-5 px-(--card-spacing)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="free-until" label="Free cancellation until">
            <NativeSelect
              id="free-until"
              className="w-full"
              value={String(freeHours)}
              onChange={(e) => form.set("freeHours", Number(e.target.value))}
            >
              {FREE_WINDOWS.map((w) => (
                <NativeSelectOption key={w.value} value={String(w.value)}>
                  {w.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="late-refund"
            label={free ? "Refund after that" : "Refund when a player cancels"}
          >
            <NativeSelect
              id="late-refund"
              className="w-full"
              value={String(lateRefund)}
              onChange={(e) => form.set("lateRefund", Number(e.target.value))}
            >
              {LATE_REFUNDS.map((p) => (
                <NativeSelectOption key={p} value={String(p)}>
                  {p === 0 ? "No refund" : `${p}% refund`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>

        {/* What players read, as a timeline up to the start of the game. */}
        <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Players see
          </span>
          <div className="flex h-2 overflow-hidden rounded-full">
            {free && <span className="w-3/5 bg-success" />}
            <span
              className={cn(
                "flex-1",
                lateRefund === 100
                  ? "bg-success"
                  : lateRefund === 0
                    ? "bg-destructive"
                    : "bg-warning",
              )}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Booking made</span>
            {free && <span>{freeHours} h before</span>}
            <span>Game starts</span>
          </div>
          <p className="text-sm">
            {free ? (
              <>
                Cancel <strong>{freeHours} hours or more</strong> before your slot for a{" "}
                <strong>full refund</strong>. After that,{" "}
                {lateRefund === 0 ? (
                  <strong>no refund</strong>
                ) : (
                  <>
                    you get <strong>{lateRefund}% back</strong>
                  </>
                )}
                .
              </>
            ) : lateRefund === 0 ? (
              <>
                Bookings <strong>can&apos;t be refunded</strong> once paid.
              </>
            ) : (
              <>
                Cancel any time before your slot and get <strong>{lateRefund}% back</strong>.
              </>
            )}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          If you cancel a booking yourself (rain, maintenance), the player always gets a full
          refund. Refunds reach players in 5 to 7 working days.
        </p>
      </div>
      <SaveBar
        dirty={form.dirty}
        onReset={form.reset}
        onSave={() => {
          form.save();
          toast.add({
            type: "success",
            title: "Cancellation rules saved",
            description: "New bookings follow them from now on.",
          });
        }}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Booking preferences
// ---------------------------------------------------------------------------

function BookingCard() {
  const form = useDraft({ aheadDays: 30, gapMinutes: 0, sendQr: true });
  const { draft } = form;

  return (
    <Section
      id="booking"
      title="Booking preferences"
      icon={CalendarCogIcon}
      badge={<SampleBadge sprint="Sprint 3" />}
    >
      <div className="mx-(--card-spacing) flex flex-col divide-y divide-border/60">
        <SettingRow
          title="Instant confirmation when the player pays"
          detail="Players get their slot the moment payment goes through. You never have to approve bookings."
        >
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            Always on
            <Switch checked disabled aria-label="Instant confirmation" />
          </span>
        </SettingRow>
        <SettingRow
          title="How far ahead players can book"
          detail="Slots further out than this stay hidden."
        >
          <NativeSelect
            aria-label="How far ahead players can book"
            value={String(draft.aheadDays)}
            onChange={(e) => form.set("aheadDays", Number(e.target.value))}
          >
            {[7, 14, 30, 60, 90].map((d) => (
              <NativeSelectOption key={d} value={String(d)}>
                {d} days
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </SettingRow>
        <SettingRow
          title="Gap between bookings"
          detail="Time to clear the court and let the next group in. Nobody can book it."
        >
          <NativeSelect
            aria-label="Gap between bookings"
            value={String(draft.gapMinutes)}
            onChange={(e) => form.set("gapMinutes", Number(e.target.value))}
          >
            {[0, 5, 10, 15, 30].map((m) => (
              <NativeSelectOption key={m} value={String(m)}>
                {m === 0 ? "No gap" : `${m} minutes`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </SettingRow>
        <SettingRow
          title="Send QR code with confirmations"
          detail="Players show it at the gate; staff scan it on the Check-in screen."
        >
          <Switch
            checked={draft.sendQr}
            onCheckedChange={(v) => form.set("sendQr", v)}
            aria-label="Send QR code with confirmations"
          />
        </SettingRow>
      </div>
      <SaveBar
        dirty={form.dirty}
        onReset={form.reset}
        onSave={() => {
          form.save();
          toast.add({ type: "success", title: "Booking preferences saved" });
        }}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

interface Device {
  id: string;
  name: string;
  detail: string;
  icon: LucideIcon;
  current: boolean;
}

/** "Chrome on Windows" from the browser's user agent. */
function describe(agent: string) {
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Chrome\//.test(agent)
      ? "Chrome"
      : /Firefox\//.test(agent)
        ? "Firefox"
        : /Safari\//.test(agent)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(agent)
    ? "Windows"
    : /Android/.test(agent)
      ? "Android"
      : /iPhone|iPad/.test(agent)
        ? "iPhone"
        : /Mac OS X/.test(agent)
          ? "Mac"
          : /Linux/.test(agent)
            ? "Linux"
            : "a computer";
  return { name: `${browser} on ${os}`, phone: /Android|iPhone/.test(agent) };
}

function SecurityCard() {
  const router = useRouter();
  const client = useQueryClient();
  const [here, setHere] = useState({ name: "This browser", phone: false });
  const [others, setOthers] = useState<Device[]>([
    {
      id: "d2",
      name: "Yoorker app on Android",
      detail: "Rohtak, Haryana · 2 hours ago",
      icon: SmartphoneIcon,
      current: false,
    },
    {
      id: "d3",
      name: "Safari on iPhone",
      detail: "Gurugram, Haryana · 3 days ago",
      icon: SmartphoneIcon,
      current: false,
    },
  ]);

  // The user agent only exists in the browser, so read it after the first paint.
  useEffect(() => {
    const id = requestAnimationFrame(() => setHere(describe(navigator.userAgent)));
    return () => cancelAnimationFrame(id);
  }, []);

  const signOutHere = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    client.clear();
    router.replace("/sign-in");
  };

  const devices: Device[] = [
    {
      id: "here",
      name: here.name,
      detail: "Active now",
      icon: here.phone ? SmartphoneIcon : LaptopIcon,
      current: true,
    },
    ...others,
  ];

  return (
    <Section id="security" title="Security" icon={ShieldCheckIcon}>
      <p className="-mt-2 px-(--card-spacing) text-sm text-muted-foreground">
        Where you&apos;re signed in. Sign out of anything you don&apos;t recognise.
      </p>
      <ul className="mx-(--card-spacing) divide-y divide-border/60">
        {devices.map((d) => {
          const Icon = d.icon;
          return (
            <li key={d.id} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-5 text-muted-foreground" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {d.name}
                  {d.current && <StatusBadge tone="success">This device</StatusBadge>}
                </span>
                <span className="text-xs text-muted-foreground">{d.detail}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (d.current) return signOutHere();
                  setOthers((list) => list.filter((x) => x.id !== d.id));
                  toast.add({
                    type: "success",
                    title: `Signed out of ${d.name}`,
                  });
                }}
              >
                Sign out
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="mx-(--card-spacing) flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <span className="text-xs text-muted-foreground">
          Lost a phone? Sign out everywhere, then sign in again here.
        </span>
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            setOthers([]);
            toast.add({
              type: "success",
              title: "Signed out of every other device",
              description: "This device stays signed in.",
            });
          }}
          disabled={others.length === 0}
        >
          Sign out everywhere else
        </Button>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const CHANNELS = [
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircleIcon },
  { id: "email", label: "Email", icon: MailIcon },
  { id: "push", label: "Push", icon: SmartphoneIcon },
] as const;
type ChannelId = (typeof CHANNELS)[number]["id"];

const EVENTS: { id: string; label: string; detail: string }[] = [
  {
    id: "booking_new",
    label: "New booking",
    detail: "A player books and pays, or staff add a walk-in",
  },
  {
    id: "booking_cancelled",
    label: "Booking cancelled",
    detail: "A player or your staff cancel a booking",
  },
  {
    id: "payment_received",
    label: "Payment received",
    detail: "Money comes in online or is collected at the venue",
  },
  {
    id: "refund_started",
    label: "Refund started",
    detail: "A refund goes back to a player",
  },
  {
    id: "review_new",
    label: "New review",
    detail: "A player rates their game",
  },
  {
    id: "booking_upcoming",
    label: "Upcoming booking (1 h before)",
    detail: "A reminder an hour before each slot starts",
  },
  {
    id: "settlement_done",
    label: "Settlement completed",
    detail: "Your weekly payout reaches the bank",
  },
];

/** Sensible defaults: the urgent ones everywhere, the busy ones as push only. */
const DEFAULT_CHANNELS: Record<string, ChannelId[]> = {
  booking_new: ["whatsapp", "push"],
  booking_cancelled: ["whatsapp", "email", "push"],
  payment_received: ["push"],
  refund_started: ["email"],
  review_new: ["email", "push"],
  booking_upcoming: ["push"],
  settlement_done: ["whatsapp", "email"],
};

function NotificationsCard() {
  const form = useDraft(DEFAULT_CHANNELS);
  const { draft } = form;

  const has = (event: string, channel: ChannelId) => draft[event]?.includes(channel) ?? false;
  const toggle = (event: string, channel: ChannelId, on: boolean) =>
    form.set(
      event,
      on
        ? CHANNELS.map((c) => c.id).filter((c) => c === channel || has(event, c))
        : (draft[event] ?? []).filter((c) => c !== channel),
    );
  const allOn = (channel: ChannelId) => EVENTS.every((e) => has(e.id, channel));
  // One update for the whole column, so every row changes together.
  const setColumn = (channel: ChannelId, on: boolean) => {
    for (const e of EVENTS) {
      const list = draft[e.id] ?? [];
      form.set(
        e.id,
        on
          ? CHANNELS.map((c) => c.id).filter((c) => c === channel || list.includes(c))
          : list.filter((c) => c !== channel),
      );
    }
  };

  return (
    <Section
      id="notifications"
      title="Notifications"
      icon={BellIcon}
      badge={<SampleBadge />}
      className="xl:col-span-2"
    >
      <p className="-mt-2 px-(--card-spacing) text-sm text-muted-foreground">
        Choose how you hear about each event. WhatsApp goes to your mobile, email to your business
        email, push to the Yoorker app on your phone.
      </p>
      <div className="overflow-x-auto px-(--card-spacing)">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 pe-4 text-start font-medium text-muted-foreground">Event</th>
              {CHANNELS.map((c) => {
                const Icon = c.icon;
                return (
                  <th key={c.id} className="w-32 px-2 py-2 font-medium">
                    <span className="flex flex-col items-center gap-1.5">
                      <span className="flex items-center gap-1.5">
                        <Icon className="size-4 text-muted-foreground" />
                        {c.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setColumn(c.id, !allOn(c.id))}
                        className="text-xs font-normal text-muted-foreground hover:text-primary"
                      >
                        {allOn(c.id) ? "Turn all off" : "Turn all on"}
                      </button>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {EVENTS.map((e) => (
              <tr key={e.id} className="hover:bg-muted/30">
                <td className="py-3 pe-4">
                  <span className="block font-medium">{e.label}</span>
                  <span className="text-xs text-muted-foreground">{e.detail}</span>
                </td>
                {CHANNELS.map((c) => (
                  <td key={c.id} className="px-2 py-3 text-center">
                    <Switch
                      checked={has(e.id, c.id)}
                      onCheckedChange={(on) => toggle(e.id, c.id, on)}
                      aria-label={`${e.label} by ${c.label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {EVENTS.some((e) => (draft[e.id] ?? []).length === 0) && (
        <p className="mx-(--card-spacing) rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning-foreground dark:text-warning">
          You won&apos;t hear about{" "}
          {EVENTS.filter((e) => (draft[e.id] ?? []).length === 0)
            .map((e) => e.label.toLowerCase())
            .join(", ")}{" "}
          anywhere. They still show in the dashboard.
        </p>
      )}
      <SaveBar
        dirty={form.dirty}
        onReset={form.reset}
        onSave={() => {
          form.save();
          toast.add({ type: "success", title: "Notification settings saved" });
        }}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Help & support
// ---------------------------------------------------------------------------

function HelpCard() {
  const options: {
    icon: LucideIcon;
    title: string;
    detail: string;
    action: string;
    href: string;
  }[] = [
    {
      icon: MessageCircleIcon,
      title: "Chat on WhatsApp",
      detail: "Fastest. Replies in about 10 minutes, 8 AM to 11 PM.",
      action: "Open chat",
      href: "#",
    },
    {
      icon: PhoneIcon,
      title: "Call us",
      detail: "For urgent problems, like players stuck at the gate.",
      action: "Call",
      href: "#",
    },
    {
      icon: MailIcon,
      title: "Email",
      detail: "For payouts, invoices and anything with documents.",
      action: "Write",
      href: "#",
    },
    {
      icon: BookOpenIcon,
      title: "Help centre",
      detail: "Short guides: prices, blocks, refunds, staff.",
      action: "Browse",
      href: "#",
    },
  ];
  return (
    <Section id="help" title="Help & support" icon={LifeBuoyIcon} className="xl:col-span-2">
      <div className="grid gap-3 px-(--card-spacing) sm:grid-cols-2 xl:grid-cols-4">
        {options.map((o) => {
          const Icon = o.icon;
          return (
            <a
              key={o.title}
              href={o.href}
              onClick={(e) => {
                e.preventDefault();
                toast.add({
                  type: "success",
                  title: "Support contacts are coming soon",
                });
              }}
              className="group flex items-start gap-3 rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-4 text-muted-foreground group-hover:text-primary" />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium">{o.title}</span>
                <span className="text-xs text-muted-foreground">{o.detail}</span>
                <span className="text-xs font-medium text-primary">{o.action} →</span>
              </span>
            </a>
          );
        })}
      </div>
      <div className="mx-(--card-spacing) flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CircleHelpIcon className="size-3.5" />
          Something broken? Tell us what you clicked and what happened.
        </span>
        {DEV_NOTES && <span className="font-mono">Dashboard demo · Vite</span>}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SettingsPage() {
  const me = useMe();
  const { venue } = useCurrentVenue();
  const [active, setActive] = useState<string>("business");

  // Highlight the section being read: the last one whose top has passed near the top bar.
  // At the very bottom of the page, the last section wins even if it's short.
  useEffect(() => {
    const update = () => {
      const atEnd =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current: string = SECTIONS[0].id;
      for (const section of SECTIONS) {
        const el = document.getElementById(section.id);
        if (el && el.getBoundingClientRect().top <= 140) current = section.id;
      }
      setActive(atEnd ? SECTIONS[SECTIONS.length - 1]!.id : current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [me.data, venue]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Your business details, money, rules for players and account security."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto lg:sticky lg:top-20 lg:flex-col"
        >
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active === s.id
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {s.label}
              </a>
            );
          })}
        </nav>
        {/* Two cards a row on wide screens; each row shares one height. */}
        <div className="grid gap-6 xl:grid-cols-2">
          {/* Waits for the venue, so the address is filled in from the start. */}
          {venue && <BusinessCard key={venue.id} />}
          {me.data && <AccountCard key={me.data.user.id} user={me.data.user} />}
          <PayoutsCard />
          <CancellationCard />
          <BookingCard />
          <SecurityCard />
          <NotificationsCard />
          <HelpCard />
        </div>
      </div>
    </div>
  );
}
