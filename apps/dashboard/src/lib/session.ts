import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { api, ApiError } from "./api";
import type { Court, Me, Organisation, Venue } from "./yoorker";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api<Me>("/auth/me");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

function useOrganisations(enabled = true) {
  return useQuery({
    queryKey: ["organisations"],
    queryFn: () => api<Organisation[]>("/organisations"),
    enabled,
  });
}

export function useAllVenues() {
  const orgs = useOrganisations();
  const results = useQueries({
    queries: (orgs.data ?? []).map((org) => ({
      queryKey: ["venues", org.id],
      queryFn: () => api<Venue[]>(`/organisations/${org.id}/venues`),
    })),
  });
  const removed = useRemovedVenues((state) => state.ids);
  const venues = useMemo(
    () =>
      results.flatMap((result) => result.data ?? []).filter((venue) => !removed.includes(venue.id)),
    [results, removed],
  );
  const loading = orgs.isLoading || results.some((result) => result.isLoading);
  return { organisations: orgs.data ?? [], venues, loading };
}

/**
 * Venues deleted in this demo. The API has no delete yet, so they are hidden on this device
 * until it does (see the Delete venue dialog).
 */
export const useRemovedVenues = create<{
  ids: string[];
  remove: (id: string) => void;
  restoreAll: () => void;
}>()(
  persist(
    (set) => ({
      ids: [],
      remove: (id) => set((state) => ({ ids: [...state.ids, id] })),
      restoreAll: () => set({ ids: [] }),
    }),
    { name: "yoorker-removed-venues" },
  ),
);

export const useVenueChoice = create<{
  venueId: string | null;
  choose: (id: string) => void;
}>()(
  persist((set) => ({ venueId: null, choose: (venueId) => set({ venueId }) }), {
    name: "yoorker-venue",
  }),
);

export function useCurrentVenue() {
  const { organisations, venues, loading } = useAllVenues();
  const venueId = useVenueChoice((state) => state.venueId);
  const venue = venues.find((v) => v.id === venueId) ?? venues[0] ?? null;
  const role = organisations.find((org) => org.id === venue?.organisationId)?.role ?? null;
  const courts = useQuery({
    queryKey: ["courts", venue?.id],
    queryFn: () => api<Court[]>(`/venues/${venue!.id}/courts`),
    enabled: Boolean(venue),
  });
  return {
    venue,
    role,
    organisations,
    venues,
    courts: courts.data ?? [],
    loading: loading || courts.isLoading,
  };
}

export function useRefreshAll() {
  const client = useQueryClient();
  return () => client.invalidateQueries();
}
