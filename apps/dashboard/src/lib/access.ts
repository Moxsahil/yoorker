import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { api } from "./api";
import { useCurrentVenue, useMe } from "./session";
import type { Access, DashboardSection } from "./yoorker";

const NEEDS: Record<DashboardSection, Access | null> = {
  overview: null,
  bookings: "bookings",
  live: "checkin",
  venues: null,
  availability: "venues",
  customers: "customers",
  staff: "settings",
  earnings: "earnings",
  offers: "earnings",
  analytics: "reports",
  reviews: null,
  marketing: "settings",
  settings: null,
};

export function sectionFor(pathname: string): DashboardSection | null {
  const first = pathname.split("/")[1] ?? "";
  if (first === "") return "overview";
  return first in NEEDS ? (first as DashboardSection) : null;
}

export function useFeatures() {
  return useQuery({
    queryKey: ["features"],
    queryFn: () => api<{ sections: DashboardSection[] }>("/features"),
    staleTime: Infinity,
  });
}

export function useAccess() {
  const me = useMe();
  const features = useFeatures();
  const { venue } = useCurrentVenue();
  const membership =
    me.data?.memberships.find((m) => m.organisationId === venue?.organisationId) ?? null;
  const access = membership && membership.role !== "OWNER" ? membership.access : null;
  const enabled = features.data?.sections ?? null;

  const has = useCallback((key: Access) => access === null || access.includes(key), [access]);
  const can = useCallback(
    (section: DashboardSection) => {
      const needs = NEEDS[section];
      return (enabled?.includes(section) ?? true) && (needs === null || has(needs));
    },
    [enabled, has],
  );
  return { has, can, role: membership?.role ?? "OWNER" };
}
