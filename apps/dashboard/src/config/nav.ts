import {
  ActivityIcon,
  BarChart3Icon,
  Building2Icon,
  CalendarCheckIcon,
  Clock3Icon,
  IndianRupeeIcon,
  LayoutDashboardIcon,
  MegaphoneIcon,
  SettingsIcon,
  StarIcon,
  TicketPercentIcon,
  UserCogIcon,
  UsersIcon,
} from "lucide-react";

import type { NavGroup, NavLink } from "@/kit/shell/types";

/**
 * Yoorker's 13 sections (Sprint Plan v1.2). One list drives the sidebar, ⌘K and the G shortcuts.
 * Notifications live behind the bell in the top bar.
 */
export const NAV: NavGroup[] = [
  {
    items: [
      {
        title: "Overview",
        href: "/",
        icon: LayoutDashboardIcon,
        shortcut: "o",
      },
      {
        title: "Bookings",
        href: "/bookings",
        icon: CalendarCheckIcon,
        shortcut: "b",
        badge: "bookings",
      },
      { title: "Live board", href: "/live", icon: ActivityIcon, shortcut: "l" },
    ],
  },
  {
    label: "Venue",
    items: [
      {
        title: "Venues & courts",
        href: "/venues",
        icon: Building2Icon,
        shortcut: "v",
      },
      {
        title: "Availability & pricing",
        href: "/availability",
        icon: Clock3Icon,
        shortcut: "p",
      },
      {
        title: "Customers",
        href: "/customers",
        icon: UsersIcon,
        shortcut: "c",
      },
      { title: "Staff", href: "/staff", icon: UserCogIcon },
    ],
  },
  {
    label: "Money",
    items: [
      {
        title: "Earnings & payouts",
        href: "/earnings",
        icon: IndianRupeeIcon,
        shortcut: "e",
      },
      { title: "Offers & discounts", href: "/offers", icon: TicketPercentIcon },
    ],
  },
  {
    label: "Grow",
    items: [
      {
        title: "Analytics",
        href: "/analytics",
        icon: BarChart3Icon,
        shortcut: "a",
      },
      { title: "Reviews", href: "/reviews", icon: StarIcon },
      { title: "Marketing", href: "/marketing", icon: MegaphoneIcon },
    ],
  },
];

export const SECONDARY_NAV: NavLink[] = [
  { title: "Settings", href: "/settings", icon: SettingsIcon, shortcut: "s" },
];
