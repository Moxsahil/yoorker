import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { DemoBooking } from "./demo-data";

/**
 * Bookings typed in by hand at the counter (walk-ins). The API takes bookings in Sprint 3; until
 * then they live in this browser only, next to the sample data.
 */
export const useManualBookings = create<{
  bookings: DemoBooking[];
  add: (booking: Omit<DemoBooking, "id">) => DemoBooking;
}>()(
  persist(
    (set, get) => ({
      bookings: [],
      add: (input) => {
        const booking = {
          ...input,
          id: `BK-M${String(get().bookings.length + 1).padStart(4, "0")}`,
        };
        set((state) => ({ bookings: [...state.bookings, booking] }));
        return booking;
      },
    }),
    { name: "yoorker-manual-bookings" },
  ),
);
