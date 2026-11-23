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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogBody,
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
import { api } from "@/lib/api";
import { daysBetween } from "@/lib/period";
import { useCurrentVenue, useMe } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  ACCESS,
  dayLabel,
  roleForAccess,
  todayAt,
  type Access,
  type Role,
  type TeamMember,
} from "@/lib/yoorker";

import { AttendanceTab, type AttendanceMember } from "./attendance";
import { LiveBadge } from "./common";
import { StaffSkeleton } from "./page-skeletons";

const ACCESS_INFO: Record<Access, { label: string; detail: string; icon: LucideIcon }> = {
  bookings: {
    label: "Bookings",
    detail: "See, add and cancel bookings",
    icon: CalendarCheckIcon,
  },
  checkin: {
    label: "Check-in",
    detail: "Live board and arrivals",
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

const PRESETS: { title: string; access: Access[] }[] = [
  { title: "Manager", access: [...ACCESS] },
  { title: "Receptionist", access: ["bookings", "checkin", "customers"] },
  { title: "Ground staff", access: ["checkin"] },
  { title: "Accountant", access: ["reports", "earnings"] },
];

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const displayName = (m: TeamMember) => m.name ?? m.email ?? "Team member";

const istDate = (instant: string) =>
  new Date(instant).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const lastSeen = (instant: string | null, today: string) => {
  if (!instant) return "Not signed in yet";
  const date = istDate(instant);
  const days = daysBetween(date, today) - 1;
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : dayLabel(date);
};

const validEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

interface MemberInput {
  email: string;
  name: string;
  title: string;
  access: Access[];
  venueIds: string[] | null;
}

function StaffDialog({
  member,
  open,
  onOpenChange,
  venues,
  canAddManagers,
  onSave,
}: {
  member: TeamMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venues: { id: string; name: string }[];
  canAddManagers: boolean;
  onSave: (input: MemberInput) => Promise<unknown>;
}) {
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [title, setTitle] = useState(member?.title ?? "");
  const [access, setAccess] = useState<Access[]>(member?.access ?? ["bookings", "checkin"]);
  const [all, setAll] = useState(member ? member.venueIds === null : true);
  const [picked, setPicked] = useState<string[]>(member?.venueIds ?? []);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const problem = !name.trim()
    ? "Enter their name."
    : !validEmail(email.trim())
      ? "Enter the email of their Google account."
      : !title.trim()
        ? "Give them a role name, e.g. Receptionist."
        : access.length === 0
          ? "Turn on at least one thing they can open."
          : !all && picked.length === 0
            ? "Pick at least one venue."
            : !canAddManagers && roleForAccess(access) === "MANAGER"
              ? "Only the owner can give Settings access, which makes someone a manager."
              : null;

  const toggle = (key: Access, on: boolean) =>
    setAccess((list) =>
      on ? ACCESS.filter((k) => k === key || list.includes(k)) : list.filter((k) => k !== key),
    );

  const save = async () => {
    setTried(true);
    if (problem) return;
    setSaving(true);
    setFailed(null);
    try {
      await onSave({
        email: email.trim(),
        name: name.trim(),
        title: title.trim(),
        access,
        venueIds: all ? null : picked,
      });
      onOpenChange(false);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{member ? `Edit ${displayName(member)}` : "Add staff"}</DialogTitle>
          <DialogDescription>
            {member
              ? "Changes apply the next time they open the dashboard."
              : "They sign in with Google using this email. No password needed."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
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
              {/* TODO(TURF-105): offer a mobile number instead once phone OTP sign-in is live. */}
              <Label htmlFor="st-email">Google account email</Label>
              <Input
                id="st-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="name@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={Boolean(member)}
              />
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
              {PRESETS.filter(
                (preset) => canAddManagers || roleForAccess(preset.access) !== "MANAGER",
              ).map((preset) => (
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
                    <label key={v.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={picked.includes(v.id)}
                        onCheckedChange={(on) =>
                          setPicked((list) =>
                            on ? [...list, v.id] : list.filter((x) => x !== v.id),
                          )
                        }
                      />
                      <span className="truncate">{v.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>What they can open</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {ACCESS.map((key) => {
                const info = ACCESS_INFO[key];
                const Icon = info.icon;
                const on = access.includes(key);
                const locked = key === "settings" && !canAddManagers;
                return (
                  <label
                    key={key}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                      on ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40",
                      locked ? "opacity-60" : "cursor-pointer",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        on ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">{info.label}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {locked ? "Only the owner can give this" : info.detail}
                      </span>
                    </span>
                    <Switch
                      size="sm"
                      checked={on}
                      disabled={locked}
                      onCheckedChange={(v) => toggle(key, v)}
                      aria-label={info.label}
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {tried && problem && <p className="text-xs text-destructive">{problem}</p>}
          {failed && <p className="text-xs text-destructive">{failed}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : member ? "Save changes" : "Add staff"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StaffPage() {
  const me = useMe();
  const client = useQueryClient();
  const { venue, venues, role: myRole, loading } = useCurrentVenue();
  const organisationId = venue?.organisationId;
  const today = todayAt();
  const orgVenues = useMemo(
    () => venues.filter((v) => v.organisationId === organisationId),
    [venues, organisationId],
  );
  const venueName = (id: string) => orgVenues.find((v) => v.id === id)?.name ?? "Removed venue";
  const [dialog, setDialog] = useState<{ open: boolean; member: TeamMember | null }>({
    open: false,
    member: null,
  });
  const [tab, setTab] = useState<"team" | "attendance">("team");
  const myId = me.data?.user.id;

  const teamKey = ["team", organisationId];
  const team = useQuery({
    queryKey: teamKey,
    queryFn: () => api<TeamMember[]>(`/organisations/${organisationId}/members`),
    enabled: Boolean(organisationId),
  });
  const refresh = () => client.invalidateQueries({ queryKey: teamKey });
  const members = team.data ?? [];

  const canChange = (m: TeamMember) =>
    m.id !== myId && m.role !== "OWNER" && (myRole === "OWNER" || m.role !== "MANAGER");

  const update = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: Partial<MemberInput> }) =>
      api<TeamMember>(`/organisations/${organisationId}/members/${id}`, {
        method: "PATCH",
        body: changes,
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (m: TeamMember) =>
      api(`/organisations/${organisationId}/members/${m.id}`, { method: "DELETE" }),
    onSuccess: (_, m) => {
      refresh();
      toast.add({
        type: "success",
        title: m.status === "INVITED" ? "Invite cancelled" : `${displayName(m)} removed`,
        description: m.status === "INVITED" ? undefined : "They can no longer open this dashboard.",
      });
    },
    onError: (error) =>
      toast.add({ type: "error", title: "Couldn't remove", description: error.message }),
  });

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
    update.mutate(
      { id: m.id, changes: { access } },
      {
        onSuccess: () =>
          toast.add({
            type: "success",
            title: `${ACCESS_INFO[key].label} ${on ? "on" : "off"} for ${displayName(m)}`,
          }),
        onError: (error) =>
          toast.add({ type: "error", title: "Couldn't change access", description: error.message }),
      },
    );
  };

  const attendanceTeam: AttendanceMember[] = members
    .filter((m) => m.status === "ACTIVE" && m.role !== "OWNER")
    .map((m) => ({
      id: m.id,
      name: displayName(m),
      phone: m.phone ?? m.email ?? "",
      role: m.role,
      title: m.title ?? ROLE_NAME[m.role],
      lastActive: m.lastSignInAt ? istDate(m.lastSignInAt) : null,
    }));

  if (loading || team.isLoading) return <StaffSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff"
        description="Your team, what each person can open, and their attendance for salary."
        meta={<LiveBadge />}
        actions={
          <Button onClick={() => setDialog({ open: true, member: null })}>
            <UserPlusIcon data-icon="inline-start" />
            Add staff
          </Button>
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
        <AttendanceTab team={attendanceTeam} today={today} />
      ) : (
        <>
          <Widget>
            <WidgetHeader
              title={
                <span className="flex items-center gap-2">
                  Team
                  <span className="text-sm font-normal text-muted-foreground tabular-nums">
                    {members.length}
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
                  {members.map((m) => {
                    const isYou = m.id === myId;
                    const name = displayName(m);
                    return (
                      <TableRow key={m.id} className="border-border/60 hover:bg-muted/40">
                        <TableCell>
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
                              aria-hidden
                            >
                              {initials(name)}
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate font-medium">
                                {name}
                                {isYou && (
                                  <span className="font-normal text-muted-foreground"> (you)</span>
                                )}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {m.email ?? m.phone}
                              </span>
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="block truncate text-sm">
                            {m.role === "OWNER" ? "Owner" : (m.title ?? ROLE_NAME[m.role])}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="block truncate text-sm">
                            {m.venueIds === null
                              ? "All venues"
                              : m.venueIds.map(venueName).join(", ")}
                          </span>
                        </TableCell>
                        <TableCell>
                          {m.role === "OWNER" ? (
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
                            <StatusBadge tone="warning">Invited</StatusBadge>
                          ) : (
                            <span className="text-sm">{lastSeen(m.lastSignInAt, today)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-end">
                          {canChange(m) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Options for ${name}`}
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
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => remove.mutate(m)}
                                >
                                  {m.status === "INVITED" ? "Cancel invite" : "Remove from team"}
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
                  {members
                    .filter((m) => m.role !== "OWNER")
                    .map((m) => (
                      <TableRow key={m.id} className="border-border/60 hover:bg-muted/40">
                        <TableCell>
                          <span className="block truncate text-sm font-medium">
                            {displayName(m)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {m.title ?? ROLE_NAME[m.role]}
                          </span>
                        </TableCell>
                        {ACCESS.map((key) => (
                          <TableCell key={key} className="text-center">
                            <Switch
                              checked={m.access.includes(key)}
                              disabled={
                                !canChange(m) ||
                                (key === "settings" && myRole !== "OWNER") ||
                                update.isPending
                              }
                              onCheckedChange={(on) => setAccessFor(m, key, on)}
                              aria-label={`${ACCESS_INFO[key].label} for ${displayName(m)}`}
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
        venues={orgVenues}
        canAddManagers={myRole === "OWNER"}
        onSave={async (input) => {
          const editing = dialog.member;
          if (editing) {
            await update.mutateAsync({
              id: editing.id,
              changes: { title: input.title, access: input.access, venueIds: input.venueIds },
            });
            toast.add({ type: "success", title: `${displayName(editing)} updated` });
            return;
          }
          const added = await api<TeamMember>(`/organisations/${organisationId}/members`, {
            body: input,
          });
          await refresh();
          toast.add({
            type: "success",
            title: `${input.name} added`,
            description:
              added.status === "ACTIVE"
                ? "They already use Yoorker, so they can open the dashboard now."
                : `They join when they sign in with Google as ${input.email}.`,
          });
        }}
      />
    </div>
  );
}

const ROLE_NAME: Record<Role, string> = { OWNER: "Owner", MANAGER: "Manager", STAFF: "Staff" };
