import { useQueryClient } from "@tanstack/react-query";
import {
  Building2Icon,
  CalendarCheckIcon,
  KeyboardIcon,
  LandPlotIcon,
  MoonIcon,
  WalletIcon,
} from "lucide-react";
import { useRouter } from "@/kit/framework";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";

import { NAV, SECONDARY_NAV } from "@/config/nav";
import { SITE } from "@/config/site";
import {
  CommandMenuProvider,
  type CommandAction,
  type CommandSearchResult,
} from "@/kit/command/command-menu";
import { NotificationBell, type BellNotification } from "@/kit/notifications/notification-bell";
import { AppShell } from "@/kit/shell/app-shell";
import type { ShellConfig, Workspace } from "@/kit/shell/types";
import { ShortcutsProvider, useShortcutsHelp } from "@/kit/shortcuts/shortcuts";
import { Button } from "@/components/ui/button";
import { BootSplash } from "@/components/yoorker/boot-splash";
import { api } from "@/lib/api";
import { demoBookings } from "@/lib/demo-data";
import { useCurrentVenue, useMe, useVenueChoice } from "@/lib/session";
import { todayAt } from "@/lib/yoorker";

const LINKS = [...NAV.flatMap((group) => group.items), ...SECONDARY_NAV];

/** SAMPLE DATA until notifications ship (Sprint 6). */
const SAMPLE_NOTIFICATIONS: BellNotification[] = [
  {
    id: "n1",
    title: "New booking",
    body: "Rohan Sharma booked Turf 1, today 7 PM · ₹1,600 paid",
    href: "/bookings",
    read: false,
    at: new Date(Date.now() - 6 * 60_000).toISOString(),
    icon: CalendarCheckIcon,
  },
  {
    id: "n2",
    title: "Walk-in not paid",
    body: "Turf 2, 6 PM · ₹1,600 to collect at the counter",
    href: "/bookings",
    read: false,
    at: new Date(Date.now() - 50 * 60_000).toISOString(),
    icon: WalletIcon,
  },
  {
    id: "n3",
    title: "Cancelled and refunded",
    body: "Priya Gupta, Cricket ground tomorrow 5:30 PM · ₹5,000 refunded",
    href: "/bookings",
    read: true,
    at: new Date(Date.now() - 5 * 3600_000).toISOString(),
    icon: CalendarCheckIcon,
  },
];

function VenueLogo({ className }: { className?: string }) {
  return <LandPlotIcon className={className} />;
}

/** Signed out: go to /sign-in. Signed in: the shell. */
function useSessionGate() {
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    if (me.data === null) router.replace("/sign-in");
  }, [me.data, router]);
  return me;
}

function Frame({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const client = useQueryClient();
  const router = useRouter();
  const { venue, venues, courts } = useCurrentVenue();
  const choose = useVenueChoice((state) => state.choose);
  const [notifications, setNotifications] = useState(SAMPLE_NOTIFICATIONS);

  const signOut = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    client.clear();
    router.replace("/sign-in");
  }, [client, router]);

  const user = me.data?.user;
  const workspaces: Workspace[] = venues.map((v) => ({
    id: v.id,
    name: v.name,
    description: [v.locality, v.city.name].filter(Boolean).join(", "),
    logo: VenueLogo,
  }));
  const config: ShellConfig = {
    ...SITE,
    workspaces:
      workspaces.length > 0
        ? workspaces
        : [
            {
              id: "none",
              name: "No venue yet",
              description: "Add your first venue",
              logo: Building2Icon,
            },
          ],
    activeWorkspaceId: venue?.id ?? "none",
    onWorkspaceSelect: (id) => id !== "none" && choose(id),
    addWorkspaceHref: "/venues",
    user: {
      name: user?.name ?? user?.phone ?? "Owner",
      email: user?.email ?? user?.phone ?? "",
      onSignOut: signOut,
    },
  };
  const today = todayAt();
  const todaysBookings = useMemo(
    () =>
      demoBookings(
        today,
        courts.map((c) => c.name),
      ).filter((b) => b.date === today && b.booking === "CONFIRMED").length,
    [courts, today],
  );

  return (
    <AppShell
      config={config}
      badges={{ bookings: todaysBookings }}
      actions={
        <NotificationBell
          items={notifications}
          onMarkRead={(ids) =>
            setNotifications((list) =>
              list.map((n) => (ids === "all" || ids.includes(n.id) ? { ...n, read: true } : n)),
            )
          }
          viewAllHref="/bookings"
          settingsHref="/settings"
          emptyDescription="Bookings, payments and cancellations appear here."
        />
      }
    >
      {children}
    </AppShell>
  );
}

function Commands({ children }: { children: React.ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme();
  const help = useShortcutsHelp();
  const router = useRouter();
  const { venues, courts } = useCurrentVenue();

  const actions = useMemo<CommandAction[]>(
    () => [
      {
        id: "block",
        title: "Block a court",
        icon: CalendarCheckIcon,
        group: "Actions",
        run: () => router.push("/availability"),
      },
      {
        id: "venue",
        title: "Add a venue or court",
        icon: Building2Icon,
        group: "Actions",
        run: () => router.push("/venues"),
      },
      {
        id: "theme",
        title: resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        icon: MoonIcon,
        shortcut: "D",
        group: "Preferences",
        run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
      {
        id: "shortcuts",
        title: "Keyboard shortcuts",
        icon: KeyboardIcon,
        shortcut: "?",
        group: "Preferences",
        run: () => help?.openHelp(),
      },
    ],
    [help, resolvedTheme, router, setTheme],
  );

  const search = useCallback(
    async (text: string): Promise<CommandSearchResult[]> => {
      const q = text.toLowerCase();
      return [
        ...venues
          .filter((v) => v.name.toLowerCase().includes(q))
          .map((v) => ({
            id: v.id,
            title: v.name,
            subtitle: `${v.locality ?? ""} ${v.city.name}`.trim(),
            href: "/venues",
            group: "Venues",
            icon: Building2Icon,
          })),
        ...courts
          .filter((c) => c.name.toLowerCase().includes(q))
          .map((c) => ({
            id: c.id,
            title: c.name,
            subtitle: "Court",
            href: `/availability?court=${c.id}`,
            group: "Courts",
            icon: LandPlotIcon,
          })),
      ];
    },
    [venues, courts],
  );

  return (
    <CommandMenuProvider
      links={LINKS}
      actions={actions}
      search={search}
      description="Jump to a page, a venue or a court, or run an action."
    >
      {children}
    </CommandMenuProvider>
  );
}

export function YoorkerShell({ children }: { children: React.ReactNode }) {
  const me = useSessionGate();
  // The API answered with an error (not "signed out"): say so instead of loading forever.
  if (me.isError && !me.data) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-medium">Can&apos;t reach the Yoorker API</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {me.error instanceof Error ? me.error.message : String(me.error)}. Check that the API on
          port 4000 and its database are running.
        </p>
        <Button variant="outline" onClick={() => me.refetch()} disabled={me.isFetching}>
          {me.isFetching ? "Trying…" : "Try again"}
        </Button>
      </div>
    );
  }
  if (!me.data) {
    return <BootSplash />;
  }
  return (
    <ShortcutsProvider
      links={LINKS}
      extra={[
        { keys: ["⌘", "K"], label: "Search and actions" },
        { keys: ["⌘", "B"], label: "Collapse or expand the sidebar" },
        { keys: ["D"], label: "Toggle dark mode" },
        { keys: ["?"], label: "Show these shortcuts" },
      ]}
    >
      <Commands>
        <Frame>{children}</Frame>
      </Commands>
    </ShortcutsProvider>
  );
}
