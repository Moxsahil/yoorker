import {
  CopyIcon,
  LinkIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  QrCodeIcon,
  SendIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { PageHeader } from "@/kit/ui-patterns/page-header";
import { Segmented } from "@/kit/ui-patterns/segmented";
import { StatusBadge, type Tone } from "@/kit/ui-patterns/status-badge";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import { demoBookings, demoCustomers } from "@/lib/demo-data";
import { addDays, daysBetween } from "@/lib/period";
import { useCurrentVenue } from "@/lib/session";
import { cn } from "@/lib/utils";
import { dayLabel, inr, todayAt } from "@/lib/yoorker";

import { SampleBadge } from "./common";
import { MarketingSkeleton } from "./page-skeletons";

type Channel = "WHATSAPP" | "SMS";
type CampaignStatus = "SENT" | "SCHEDULED" | "DRAFT";
type AudienceId = "all" | "regulars" | "lapsed" | "new" | "evening";

interface Campaign {
  id: string;
  name: string;
  channel: Channel;
  audience: AudienceId;
  /** When it went out, or will. */
  date: string;
  sent: number;
  read: number;
  bookings: number;
  revenuePaise: number;
  status: CampaignStatus;
}

/** SAMPLE prices per message; real rates come from the WhatsApp and SMS providers. */
const COST_PAISE: Record<Channel, number> = { WHATSAPP: 80, SMS: 25 };

const CHANNEL: Record<Channel, { label: string; icon: typeof SendIcon }> = {
  WHATSAPP: { label: "WhatsApp", icon: MessageCircleIcon },
  SMS: { label: "SMS", icon: MessageSquareIcon },
};

const STATUS: Record<CampaignStatus, { label: string; tone: Tone }> = {
  SENT: { label: "Sent", tone: "success" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  DRAFT: { label: "Draft", tone: "muted" },
};

function demoCampaigns(today: string): Campaign[] {
  return [
    {
      id: "c1",
      name: "Weekday morning 20% off",
      channel: "WHATSAPP",
      audience: "regulars",
      date: addDays(today, -3),
      sent: 64,
      read: 51,
      bookings: 9,
      revenuePaise: 1_152_000,
      status: "SENT",
    },
    {
      id: "c2",
      name: "We miss you on the turf",
      channel: "WHATSAPP",
      audience: "lapsed",
      date: addDays(today, -9),
      sent: 38,
      read: 27,
      bookings: 5,
      revenuePaise: 760_000,
      status: "SENT",
    },
    {
      id: "c3",
      name: "Diwali weekend slots open",
      channel: "SMS",
      audience: "all",
      date: addDays(today, -26),
      sent: 172,
      read: 0,
      bookings: 14,
      revenuePaise: 2_380_000,
      status: "SENT",
    },
    {
      id: "c4",
      name: "Sunday T20 league sign-ups",
      channel: "WHATSAPP",
      audience: "evening",
      date: addDays(today, 2),
      sent: 0,
      read: 0,
      bookings: 0,
      revenuePaise: 0,
      status: "SCHEDULED",
    },
    {
      id: "c5",
      name: "New floodlights launch",
      channel: "WHATSAPP",
      audience: "all",
      date: today,
      sent: 0,
      read: 0,
      bookings: 0,
      revenuePaise: 0,
      status: "DRAFT",
    },
  ];
}

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");

function CampaignDialog({
  open,
  onOpenChange,
  audiences,
  venueName,
  today,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audiences: { id: AudienceId; label: string; count: number }[];
  venueName: string;
  today: string;
  onCreate: (campaign: Campaign) => void;
}) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<Channel>("WHATSAPP");
  const [audience, setAudience] = useState<AudienceId>("regulars");
  const [message, setMessage] = useState(
    `Hi {name}, mornings at ${venueName} are 20% off this week. Book in 30 seconds: yoorker.com/book`,
  );
  const [when, setWhen] = useState<"now" | "later">("now");
  const [date, setDate] = useState(addDays(today, 1));
  const [tried, setTried] = useState(false);

  const count = audiences.find((a) => a.id === audience)?.count ?? 0;
  const cost = count * COST_PAISE[channel];
  const preview = message.replace(/\{name\}/g, "Rohan");
  const problem = !name.trim()
    ? "Name the campaign so you can find it later."
    : !message.trim()
      ? "Write the message."
      : channel === "SMS" && message.length > 160
        ? "An SMS fits 160 characters. Shorten it or use WhatsApp."
        : null;

  const create = (status: CampaignStatus) => {
    setTried(true);
    if (problem) return;
    onCreate({
      id: `c${Date.now()}`,
      name: name.trim(),
      channel,
      audience,
      date: status === "SCHEDULED" ? date : today,
      sent: status === "SENT" ? count : 0,
      read: 0,
      bookings: 0,
      revenuePaise: 0,
      status,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            Send a message to a group of your players. Only players who agreed to hear from you get
            it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-6 overflow-y-auto pe-1 md:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cp-name">Campaign name</Label>
              <Input
                id="cp-name"
                placeholder="e.g. Weekday morning offer"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Send by</Label>
                <Segmented<Channel>
                  aria-label="Channel"
                  value={channel}
                  onChange={setChannel}
                  options={[
                    { value: "WHATSAPP", label: "WhatsApp" },
                    { value: "SMS", label: "SMS" },
                  ]}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="cp-audience">To</Label>
                <NativeSelect
                  id="cp-audience"
                  className="w-full"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as AudienceId)}
                >
                  {audiences.map((a) => (
                    <NativeSelectOption key={a.id} value={a.id}>
                      {a.label} ({a.count})
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="cp-message">Message</Label>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    channel === "SMS" && message.length > 160
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {message.length}
                  {channel === "SMS" ? "/160" : ""}
                </span>
              </div>
              <Textarea
                id="cp-message"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Write <span className="font-mono">{"{name}"}</span> and each player sees their own
                first name.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label>When</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Segmented<"now" | "later">
                  aria-label="When"
                  className="w-auto"
                  value={when}
                  onChange={setWhen}
                  options={[
                    { value: "now", label: "Send now" },
                    { value: "later", label: "Schedule" },
                  ]}
                />
                {when === "later" && (
                  <Input
                    type="date"
                    aria-label="Send on"
                    value={date}
                    min={today}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-44"
                  />
                )}
              </div>
            </div>
          </div>

          {/* What a player sees, and what it costs. */}
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium">Preview</span>
            <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3">
              <span className="text-xs text-muted-foreground">
                {venueName} · {CHANNEL[channel].label}
              </span>
              <p
                className={cn(
                  "rounded-lg rounded-tl-sm px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                  channel === "WHATSAPP" ? "bg-success/15" : "bg-card",
                )}
              >
                {preview || "Your message shows here."}
              </p>
            </div>
            <dl className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Players</dt>
                <dd className="tabular-nums">{count}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Cost</dt>
                <dd className="font-mono tabular-nums">{inr(cost)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              About {inr(COST_PAISE[channel])} per{" "}
              {channel === "WHATSAPP" ? "WhatsApp message" : "SMS"}.
            </p>
          </div>
        </div>
        {tried && problem && <p className="text-xs text-destructive">{problem}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => create("DRAFT")}>
            Save draft
          </Button>
          <Button onClick={() => create(when === "now" ? "SENT" : "SCHEDULED")}>
            <SendIcon data-icon="inline-start" />
            {when === "now" ? `Send to ${count}` : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Copy text to the clipboard and say so. */
async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ type: "success", title: `${what} copied` });
  } catch {
    toast.add({
      type: "error",
      title: "Couldn't copy. Select the text and copy it.",
    });
  }
}

/** The venue's booking link and a ready-to-send WhatsApp message, both one tap to copy. */
function BookingLinkCard({
  link,
  venueName,
  className,
}: {
  link: string;
  venueName: string;
  className?: string;
}) {
  const url = `https://${link}`;
  const original = `⚽ Book ${venueName} online! Pick your slot and pay by UPI in 60 seconds: ${url} Use MORNING20 for 20% off weekday mornings.`;
  const [message, setMessage] = useState(original);

  return (
    <Widget className={className}>
      <WidgetHeader title="Your booking link" icon={LinkIcon} />
      <div className="flex flex-1 flex-col gap-5 px-(--card-spacing)">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5">
            <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-sm">{url}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy booking link"
              onClick={() => copy(url, "Link")}
            >
              <CopyIcon />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Put it in your Instagram bio and WhatsApp status. Players book and pay in under a
            minute.
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="wa-message">Ready-to-send WhatsApp message</Label>
            {message !== original && (
              <button
                type="button"
                onClick={() => setMessage(original)}
                className="text-xs text-muted-foreground hover:text-primary"
              >
                Reset
              </button>
            )}
          </div>
          <div className="relative flex flex-1">
            <Textarea
              id="wa-message"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-28 flex-1 resize-none pe-11 leading-relaxed"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy message"
              className="absolute end-1.5 top-1.5"
              onClick={() => copy(message, "Message")}
            >
              <CopyIcon />
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Edit it as you like, then copy it or open WhatsApp with it.
            </span>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <MessageCircleIcon data-icon="inline-start" />
              Open in WhatsApp
            </a>
          </div>
        </div>
      </div>
    </Widget>
  );
}

export function MarketingPage() {
  const { venue, courts, loading } = useCurrentVenue();
  const today = todayAt();
  const venueName = venue?.name ?? "your venue";
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [creating, setCreating] = useState(false);
  const list = campaigns ?? demoCampaigns(today);

  // Groups of players, counted from the sample bookings.
  const audiences = useMemo(() => {
    const bookings = demoBookings(
      today,
      courts.map((c) => c.name),
    );
    const people = demoCustomers(bookings, today);
    const firstSeen = new Map<string, string>();
    for (const b of bookings)
      if (b.date <= today && (!firstSeen.get(b.customer) || b.date < firstSeen.get(b.customer)!))
        firstSeen.set(b.customer, b.date);
    const evening = new Set(
      bookings
        .filter((b) => b.date <= today && Number(b.start.slice(0, 2)) >= 17)
        .map((b) => b.customer),
    );
    return [
      {
        id: "all" as const,
        label: "All players",
        detail: "Everyone who played in the last 60 days",
        count: people.length,
      },
      {
        id: "regulars" as const,
        label: "Regulars",
        detail: "5 or more bookings in 60 days",
        count: people.filter((p) => p.bookings >= 5).length,
      },
      {
        id: "lapsed" as const,
        label: "Haven't come back",
        detail: "No booking in the last 21 days",
        count: people.filter((p) => daysBetween(p.lastPlayed, today) > 22).length,
      },
      {
        id: "new" as const,
        label: "New this month",
        detail: "First booking in the last 30 days",
        count: [...firstSeen.values()].filter((d) => d >= addDays(today, -29)).length,
      },
      {
        id: "evening" as const,
        label: "Evening players",
        detail: "Book after 5 PM",
        count: people.filter((p) => evening.has(p.name)).length,
      },
    ];
  }, [courts, today]);

  const sent = list.filter((c) => c.status === "SENT");
  const totals = {
    sent: sent.reduce((s, c) => s + c.sent, 0),
    readOf: sent.filter((c) => c.channel === "WHATSAPP").reduce((s, c) => s + c.sent, 0),
    read: sent.reduce((s, c) => s + c.read, 0),
    bookings: sent.reduce((s, c) => s + c.bookings, 0),
    revenue: sent.reduce((s, c) => s + c.revenuePaise, 0),
    cost: sent.reduce((s, c) => s + c.sent * COST_PAISE[c.channel], 0),
  };
  const link = `yoorker.com/${venue?.slug ?? "your-venue"}`;
  const audienceLabel = (id: AudienceId) => audiences.find((a) => a.id === id)?.label ?? id;

  if (loading) return <MarketingSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marketing"
        description="Bring players back with WhatsApp and SMS campaigns, and share your booking link."
        meta={<SampleBadge />}
        actions={
          <Button onClick={() => setCreating(true)}>
            <MegaphoneIcon data-icon="inline-start" />
            New campaign
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Messages sent",
            value: totals.sent.toLocaleString("en-IN"),
            caption: "WhatsApp and SMS, last 30 days",
          },
          {
            label: "Read",
            value: pct(totals.read, totals.readOf),
            caption: "of WhatsApp messages were opened",
          },
          {
            label: "Bookings from campaigns",
            value: String(totals.bookings),
            caption: "booked within 3 days of a message",
          },
          {
            label: "Revenue from campaigns",
            value: inr(totals.revenue),
            caption: `from ${inr(totals.cost)} spent on messages`,
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
          title={
            <span className="flex items-center gap-2">
              Campaigns
              <span className="text-sm font-normal text-muted-foreground tabular-nums">
                {list.length}
              </span>
            </span>
          }
          icon={MegaphoneIcon}
        />
        <div className="overflow-x-auto px-[calc(var(--card-spacing)-0.75rem)]">
          <Table className="min-w-[56rem] table-fixed [&_td]:px-3 [&_td]:py-3 [&_td:first-child]:rounded-s-lg [&_td:last-child]:rounded-e-lg [&_th]:h-9 [&_th]:px-3">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[27%]">Campaign</TableHead>
                <TableHead className="w-[17%]">Sent to</TableHead>
                <TableHead className="w-[10%] text-end">Sent</TableHead>
                <TableHead className="w-[10%] text-end">Read</TableHead>
                <TableHead className="w-[10%] text-end">Bookings</TableHead>
                <TableHead className="w-[13%] text-end">Revenue</TableHead>
                <TableHead className="w-[13%] ps-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => {
                const Icon = CHANNEL[c.channel].icon;
                return (
                  <TableRow key={c.id} className="border-border/60 hover:bg-muted/40">
                    <TableCell>
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Icon className="size-4 text-muted-foreground" />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {CHANNEL[c.channel].label} ·{" "}
                            {c.status === "SCHEDULED"
                              ? `goes out ${dayLabel(c.date)}`
                              : c.status === "DRAFT"
                                ? "not sent"
                                : dayLabel(c.date)}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="truncate text-sm">{audienceLabel(c.audience)}</TableCell>
                    <TableCell className="text-end font-mono tabular-nums">
                      {c.status === "SENT" ? c.sent : "–"}
                    </TableCell>
                    <TableCell className="text-end font-mono tabular-nums">
                      {c.status === "SENT" && c.channel === "WHATSAPP" ? pct(c.read, c.sent) : "–"}
                    </TableCell>
                    <TableCell className="text-end font-mono tabular-nums">
                      {c.status === "SENT" ? c.bookings : "–"}
                    </TableCell>
                    <TableCell className="text-end font-mono tabular-nums">
                      {c.status === "SENT" ? inr(c.revenuePaise) : "–"}
                    </TableCell>
                    <TableCell className="ps-6">
                      <StatusBadge tone={STATUS[c.status].tone}>
                        {STATUS[c.status].label}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="px-(--card-spacing) text-xs text-muted-foreground">
          SMS can&apos;t tell us when a message is read, so read rates are for WhatsApp only.
        </p>
      </Widget>

      <div className="grid gap-4 xl:grid-cols-3">
        <BookingLinkCard key={link} className="xl:col-span-2" link={link} venueName={venueName} />

        <Widget>
          <WidgetHeader title="QR poster" icon={QrCodeIcon} />
          <div className="flex flex-1 flex-col gap-4 px-(--card-spacing)">
            <p className="text-sm text-muted-foreground">
              Stick it at the gate and the counter, so walk-ins book online next time.
            </p>
            {/* A placeholder pattern; the real poster has a scannable code. */}
            <div className="flex flex-1 items-center gap-4 rounded-xl bg-muted/50 p-4">
              <div
                className="grid size-24 shrink-0 grid-cols-7 gap-0.5 rounded-md bg-white p-2"
                aria-hidden
              >
                {Array.from({ length: 49 }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "rounded-[1px]",
                      (i * 7 + (i >> 2) * 3) % 5 < 2 ||
                        [0, 1, 7, 8, 5, 6, 12, 13, 35, 36, 42, 43].includes(i)
                        ? "bg-neutral-900"
                        : "bg-transparent",
                    )}
                  />
                ))}
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <span className="text-sm font-medium">A4 poster</span>
                <span className="text-xs text-muted-foreground">
                  Your venue name, prices and the code.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    toast.add({
                      type: "success",
                      title: "Poster download is coming soon",
                    })
                  }
                >
                  Download poster
                </Button>
              </div>
            </div>
          </div>
        </Widget>
      </div>

      <CampaignDialog
        key={String(creating)}
        open={creating}
        onOpenChange={setCreating}
        audiences={audiences}
        venueName={venueName}
        today={today}
        onCreate={(campaign) => {
          setCampaigns([campaign, ...list]);
          toast.add({
            type: "success",
            title:
              campaign.status === "SENT"
                ? `Sent to ${campaign.sent} players`
                : campaign.status === "SCHEDULED"
                  ? `Scheduled for ${dayLabel(campaign.date)}`
                  : "Draft saved",
            description: campaign.name,
          });
        }}
      />
    </div>
  );
}
