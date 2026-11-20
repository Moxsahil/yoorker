import {
  BarChart3Icon,
  Building2Icon,
  CalendarCheckIcon,
  EllipsisIcon,
  IndianRupeeIcon,
  KeyRoundIcon,
  ScanLineIcon,
  SettingsIcon,
  UserPlusIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { StatusBadge } from "@/kit/ui-patterns/status-badge";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import { ACCESS, demoTeam, roleFor, type Access, type TeamMember } from "@/lib/demo-team";
import { daysBetween } from "@/lib/period";
import { useCurrentVenue, useMe } from "@/lib/session";
import { cn } from "@/lib/utils";
import { dayLabel, todayAt } from "@/lib/yoorker";

import { AttendanceTab } from "./attendance";
import { SampleBadge } from "./common";

const ACCESS_INFO: Record<Access, { label: string; detail: string; icon: LucideIcon }> = {
  bookings: {
    label: "Bookings",
    detail: "See, add and cancel bookings",
    icon: CalendarCheckIcon,
  },
  checkin: {
    label: "Check-in",
    detail: "Live board, mark players arrived, collect cash",
    icon: ScanLineIcon,
  },
  customers: {
    label: "Customers",
    detail: "Player names, numbers and history",
    icon: UsersIcon,
  },
  venues: {
    label: "Venues",
    detail: "Courts, opening hours and blocks",
    icon: Building2Icon,
  },
  reports: {
    label: "Reports",
    detail: "Overview, analytics and downloads",
    icon: BarChart3Icon,
  },
  earnings: {
    label: "Earnings",
    detail: "Money, prices, payouts and offers",
    icon: IndianRupeeIcon,
  },
  settings: {
    label: "Settings",
    detail: "Team, attendance and business settings",
    icon: SettingsIcon,
  },
};

/** Quick starts for the role name; picking one fills in its usual access. */
const PRESETS: { title: string; access: Access[] }[] = [
  { title: "Manager", access: [...ACCESS] },
  { title: "Receptionist", access: ["bookings", "checkin", "customers"] },
  { title: "Ground staff", access: ["checkin"] },
  { title: "Accountant", access: ["reports", "earnings"] },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const lastSeen = (date: string | null, today: string) => {
  if (!date) return "Not signed in yet";
  const days = daysBetween(date, today) - 1;
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : dayLabel(date);
};

/** 10 digits starting 6-9, the shape of an Indian mobile number. */
const validPhone = (digits: string) => /^[6-9]\d{9}$/.test(digits);

/** Add someone, or change their details and access when `member` is given. */
function StaffDialog({
  member,
  open,
  onOpenChange,
  venues,
  onSave,
}: {
  member: TeamMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venues: string[];
  onSave: (member: TeamMember) => void;
}) {
  const [name, setName] = useState(member?.name ?? "");
  const [phone, setPhone] = useState(member?.phone.replace(/^\+91\s*/, "") ?? "");
  const [title, setTitle] = useState(member?.title ?? "");
  const [access, setAccess] = useState<Access[]>(member?.access ?? ["bookings", "checkin"]);
  const [all, setAll] = useState(member ? member.venues === null : true);
  const [picked, setPicked] = useState<string[]>(member?.venues ?? []);
  const [tried, setTried] = useState(false);

  const digits = phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  const problem = !name.trim()
    ? "Enter their name."
    : !validPhone(digits)
      ? "Enter a 10-digit mobile number."
      : !title.trim()
        ? "Give them a role name, e.g. Receptionist."
        : access.length === 0
          ? "Turn on at least one thing they can open."
          : !all && picked.length === 0
            ? "Pick at least one venue."
            : null;

  const toggle = (key: Access, on: boolean) =>
    setAccess((list) =>
      on ? ACCESS.filter((k) => k === key || list.includes(k)) : list.filter((k) => k !== key),
    );

  const save = () => {
    setTried(true);
    if (problem) return;
    onSave({
      id: member?.id ?? `m${Date.now()}`,
      name: name.trim(),
      phone: `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`,
      role: roleFor(access),
      title: title.trim(),
      venues: all ? null : picked,
      access,
      status: member?.status ?? "INVITED",
      lastActive: member?.lastActive ?? null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{member ? `Edit ${member.name}` : "Add staff"}</DialogTitle>
          <DialogDescription>
            {member
              ? "Changes apply the next time they open the dashboard."
              : "They sign in with this mobile number. No password needed."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto pe-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="st-name">Name</Label>
              <Input
                id="st-name"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="st-phone">Mobile number</Label>
              <div className="flex">
                <span className="flex items-center rounded-s-md border border-e-0 bg-muted px-2.5 font-mono text-sm text-muted-foreground">
                  +91
                </span>
                <Input
                  id="st-phone"
                  inputMode="numeric"
                  placeholder="10-digit number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={Boolean(member)}
                  className="rounded-s-none font-mono tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="st-title">Role name</Label>
            <Input
              id="st-title"
              placeholder="e.g. Receptionist, Coach, Ground staff"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={30}
            />
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => {
                    setTitle(preset.title);
                    setAccess(preset.access);
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    title === preset.title
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  {preset.title}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Picking one fills in its usual access below. You can still change it.
            </p>
          </div>

          {venues.length > 1 && (
            <div className="flex flex-col gap-2">
              <Label>Venue</Label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={all} onCheckedChange={(v) => setAll(Boolean(v))} />
                All venues, including new ones
              </label>
              {!all && (
                <div className="grid grid-cols-2 gap-2 ps-6">
                  {venues.map((v) => (
                    <label key={v} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={picked.includes(v)}
                        onCheckedChange={(on) =>
                          setPicked((list) => (on ? [...list, v] : list.filter((x) => x !== v)))
                        }
                      />
                      <span className="truncate">{v}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>What they can open</Label>
            <ul className="divide-y divide-border/60 rounded-lg border">
              {ACCESS.map((key) => {
                const info = ACCESS_INFO[key];
                const Icon = info.icon;
                const on = access.includes(key);
                return (
                  <li key={key}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          on ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm">{info.label}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {info.detail}
                        </span>
                      </span>
                      <Switch
                        checked={on}
                        onCheckedChange={(v) => toggle(key, v)}
                        aria-label={info.label}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          {tried && problem && <p className="text-xs text-destructive">{problem}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{member ? "Save changes" : "Add staff"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StaffPage() {
  const me = useMe();
  const { venues, role: myRole } = useCurrentVenue();
  const today = todayAt();
  const venueNames = useMemo(() => [...new Set(venues.map((v) => v.name))], [venues]);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [dialog, setDialog] = useState<{
    open: boolean;
    member: TeamMember | null;
  }>({ open: false, member: null });
  const [tab, setTab] = useState<"team" | "attendance">("team");
  const list = team ?? demoTeam(today, venueNames);
  const canManage = myRole === "OWNER" || myRole === "MANAGER";

  // You, from the real session, always first, with everything on.
  const you: TeamMember = {
    id: "me",
    name: me.data?.user.name ?? "You",
    phone: (me.data?.user.phone ?? "").replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2"),
    role: myRole ?? "OWNER",
    title: myRole === "MANAGER" ? "Manager" : "Owner",
    venues: null,
    access: [...ACCESS],
    status: "ACTIVE",
    lastActive: today,
  };
  const rows = [you, ...list];

  const setAccessFor = (m: TeamMember, key: Access, on: boolean) => {
    const access = on
      ? ACCESS.filter((k) => k === key || m.access.includes(k))
      : m.access.filter((k) => k !== key);
    if (access.length === 0) {
      toast.add({
        type: "error",
        title: "Leave at least one thing on",
        description: "Remove them from the team instead.",
      });
      return;
    }
    setTeam(list.map((x) => (x.id === m.id ? { ...x, access, role: roleFor(access) } : x)));
    toast.add({
      type: "success",
      title: `${ACCESS_INFO[key].label} ${on ? "on" : "off"} for ${m.name}`,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff"
        description="Your team, what each person can open, and their attendance for salary."
        meta={<SampleBadge sprint="Sprint 8" />}
        actions={
          canManage && (
            <Button onClick={() => setDialog({ open: true, member: null })}>
              <UserPlusIcon data-icon="inline-start" />
              Add staff
            </Button>
          )
        }
      />

      <Segmented<"team" | "attendance">
        aria-label="Staff view"
        className="w-auto self-start"
        value={tab}
        onChange={setTab}
        options={[
          { value: "team", label: "Team" },
          { value: "attendance", label: "Attendance" },
        ]}
      />

      {tab === "attendance" ? (
        <AttendanceTab team={list.filter((m) => m.status === "ACTIVE")} today={today} />
      ) : (
        <>
          <Widget>
            <WidgetHeader
              title={
                <span className="flex items-center gap-2">
                  Team
                  <span className="text-sm font-normal text-muted-foreground tabular-nums">
                    {rows.length}
                  </span>
                </span>
              }
              icon={UsersIcon}
            />
            <div className="overflow-x-auto px-[calc(var(--card-spacing)-0.75rem)]">
              <Table className="min-w-[56rem] table-fixed [&_td]:px-3 [&_td]:py-3 [&_td:first-child]:rounded-s-lg [&_td:last-child]:rounded-e-lg [&_th]:h-9 [&_th]:px-3">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[24%]">Member</TableHead>
                    <TableHead className="w-[14%]">Role</TableHead>
                    <TableHead className="w-[14%]">Venue</TableHead>
                    <TableHead className="w-[32%]">Can open</TableHead>
                    <TableHead className="w-[11%]">Last active</TableHead>
                    <TableHead className="w-[5%]">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((m) => {
                    const isYou = m.id === "me";
                    return (
                      <TableRow key={m.id} className="border-border/60 hover:bg-muted/40">
                        <TableCell>
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
                              aria-hidden
                            >
                              {initials(m.name)}
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate font-medium">
                                {m.name}
                                {isYou && (
                                  <span className="font-normal text-muted-foreground"> (you)</span>
                                )}
                              </span>
                              <span className="truncate font-mono text-xs text-muted-foreground tabular-nums">
                                {m.phone}
                              </span>
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="block truncate text-sm">{m.title}</span>
                        </TableCell>
                        <TableCell>
                          <span className="block truncate text-sm">
                            {m.venues === null ? "All venues" : m.venues.join(", ")}
                          </span>
                        </TableCell>
                        <TableCell>
                          {isYou ? (
                            <span className="text-sm text-muted-foreground">Everything</span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {m.access.map((key) => (
                                <span
                                  key={key}
                                  className="rounded-md bg-muted px-1.5 py-0.5 text-xs"
                                >
                                  {ACCESS_INFO[key].label}
                                </span>
                              ))}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {m.status === "INVITED" ? (
                            <StatusBadge tone="warning">Not signed in</StatusBadge>
                          ) : (
                            <span className="text-sm">{lastSeen(m.lastActive, today)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-end">
                          {canManage && !isYou && (
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Options for ${m.name}`}
                                  />
                                }
                              >
                                <EllipsisIcon />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem
                                  onClick={() => setDialog({ open: true, member: m })}
                                >
                                  Edit role and access
                                </DropdownMenuItem>
                                {m.status === "INVITED" && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      toast.add({
                                        type: "success",
                                        title: `Sign-in link sent again to ${m.phone}`,
                                      })
                                    }
                                  >
                                    Send sign-in SMS again
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => {
                                    setTeam(list.filter((x) => x.id !== m.id));
                                    toast.add({
                                      type: "success",
                                      title: `${m.name} removed`,
                                      description: "They can no longer open this dashboard.",
                                    });
                                  }}
                                >
                                  Remove from team
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Widget>

          <Widget>
            <WidgetHeader title="Access" icon={KeyRoundIcon} />
            <p className="-mt-2 px-(--card-spacing) text-sm text-muted-foreground">
              Switch any part on or off for anyone, any time. It applies the next time they open the
              dashboard.
            </p>
            <div className="overflow-x-auto px-[calc(var(--card-spacing)-0.75rem)]">
              <Table className="min-w-[52rem] [&_td]:px-3 [&_td]:py-2.5 [&_td:first-child]:rounded-s-lg [&_td:last-child]:rounded-e-lg [&_th]:h-auto [&_th]:px-3 [&_th]:py-2">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-48">Member</TableHead>
                    {ACCESS.map((key) => {
                      const Icon = ACCESS_INFO[key].icon;
                      return (
                        <TableHead
                          key={key}
                          className="text-center"
                          title={ACCESS_INFO[key].detail}
                        >
                          <span className="flex flex-col items-center gap-1">
                            <Icon className="size-4 text-muted-foreground" />
                            <span className="text-xs">{ACCESS_INFO[key].label}</span>
                          </span>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((m) => (
                    <TableRow key={m.id} className="border-border/60 hover:bg-muted/40">
                      <TableCell>
                        <span className="block truncate text-sm font-medium">{m.name}</span>
                        <span className="text-xs text-muted-foreground">{m.title}</span>
                      </TableCell>
                      {ACCESS.map((key) => (
                        <TableCell key={key} className="text-center">
                          <Switch
                            checked={m.access.includes(key)}
                            disabled={!canManage}
                            onCheckedChange={(on) => setAccessFor(m, key, on)}
                            aria-label={`${ACCESS_INFO[key].label} for ${m.name}`}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Widget>
        </>
      )}

      <StaffDialog
        key={`${dialog.member?.id ?? "new"}-${dialog.open}`}
        member={dialog.member}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        venues={venueNames}
        onSave={(saved) => {
          const exists = list.some((x) => x.id === saved.id);
          setTeam(exists ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved]);
          toast.add({
            type: "success",
            title: exists ? `${saved.name} updated` : `${saved.name} added`,
            description: exists
              ? undefined
              : `An SMS with a sign-in link is on its way to ${saved.phone}.`,
          });
        }}
      />
    </div>
  );
}
