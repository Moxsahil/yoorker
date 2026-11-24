import { describe, expect, it } from "vitest";
import type { PriceBook } from "../pricing/pricing";
import { gridForDay, nextFree, slotsForDay, type CourtCalendar } from "./slot-grid";

const MONDAY = "2026-12-21";
const SATURDAY = "2026-12-26";

const book: PriceBook = {
  basePricePerHourPaise: 120_000,
  rules: [
    {
      name: "Evening",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      onDate: null,
      fromMinute: 18 * 60,
      toMinute: 24 * 60,
      minutes: null,
      unit: "PER_HOUR",
      pricePaise: 160_000,
      priority: 0,
    },
  ],
};

const calendar: CourtCalendar = {
  timezone: "Asia/Kolkata",
  startStepMinutes: 30,
  windows: [
    { weekday: 1, opensMinute: 360, closesMinute: 1380 }, // Mon 06:00-23:00
    { weekday: 6, opensMinute: 1080, closesMinute: 1560 }, // Sat 18:00-02:00
  ],
  book,
  blocks: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      startsAt: new Date("2026-12-21T02:30:00Z"), // Mon 08:00 IST
      endsAt: new Date("2026-12-21T04:30:00Z"), // Mon 10:00 IST
      reason: "MAINTENANCE",
    },
  ],
  bookings: [],
};

const LONG_AGO = new Date("2026-01-01T00:00:00Z");
const byStart = <T extends { start: string }>(list: T[]) =>
  Object.fromEntries(list.map((s) => [s.start, s]));

describe("slotsForDay", () => {
  it("gives every start with its price, and blocks any slot that overlaps a block", () => {
    const slots = slotsForDay(calendar, MONDAY, 60, null, LONG_AGO);
    expect(slots).toHaveLength(33); // 06:00, 06:30 ... 22:00
    const at = byStart(slots);
    expect(at["07:00"]).toMatchObject({ status: "FREE", end: "08:00", pricePaise: 120_000 });
    expect(at["07:30"]!.status).toBe("BLOCKED"); // 07:30-08:30 runs into the block
    expect(at["09:30"]!.status).toBe("BLOCKED");
    expect(at["10:00"]!.status).toBe("FREE");
    // 17:30-18:30: half an hour at 1,200 and half at the evening 1,600.
    expect(at["17:30"]).toMatchObject({ pricePaise: 140_000, ruleName: null });
    expect(at["10:00"]!.startsAt).toBe("2026-12-21T04:30:00.000Z");
  });

  it("marks started slots as past", () => {
    const now = new Date("2026-12-21T05:00:00Z"); // 10:30 IST
    const at = byStart(slotsForDay(calendar, MONDAY, 60, null, now));
    expect(at["06:30"]!.status).toBe("PAST");
    expect(at["08:00"]!.status).toBe("BLOCKED"); // a block wins over past
    expect(at["10:30"]!.status).toBe("FREE"); // starts right now
    expect(at["11:00"]!.status).toBe("FREE");
  });

  it("shows held and booked time, with a confirmed booking winning over a hold (TURF-302)", () => {
    const busy: CourtCalendar = {
      ...calendar,
      bookings: [
        {
          startsAt: new Date("2026-12-21T07:30:00Z"), // Mon 13:00 IST
          endsAt: new Date("2026-12-21T08:30:00Z"), // Mon 14:00 IST
          status: "HELD",
        },
        {
          startsAt: new Date("2026-12-21T08:30:00Z"), // Mon 14:00 IST
          endsAt: new Date("2026-12-21T09:30:00Z"), // Mon 15:00 IST
          status: "CONFIRMED",
        },
      ],
    };
    const at = byStart(slotsForDay(busy, MONDAY, 60, null, LONG_AGO));
    expect(at["12:00"]!.status).toBe("FREE");
    expect(at["12:30"]!.status).toBe("HELD"); // 12:30-13:30 runs into the hold
    expect(at["13:30"]!.status).toBe("BOOKED"); // touches both; booked wins
    expect(at["15:00"]!.status).toBe("FREE");
    const cells = Object.fromEntries(gridForDay(busy, MONDAY, LONG_AGO).map((c) => [c.start, c]));
    expect(cells["13:00"]!.status).toBe("HELD");
    expect(cells["14:30"]!.status).toBe("BOOKED");
  });

  it("runs Saturday night past midnight and uses the package price when there is one", () => {
    const slots = slotsForDay(calendar, SATURDAY, 120, 300_000, LONG_AGO);
    expect(slots.at(-1)).toMatchObject({ start: "00:00", end: "02:00", pricePaise: 300_000 });
    expect(slots.at(-1)!.endsAt).toBe("2026-12-26T20:30:00.000Z");
  });

  it("has no slots on a closed day", () => {
    expect(slotsForDay(calendar, "2026-12-22", 60, null, LONG_AGO)).toEqual([]);
  });
});

describe("gridForDay", () => {
  it("makes a cell per start step inside opening hours, with the block on its cells", () => {
    const cells = gridForDay(calendar, MONDAY, LONG_AGO);
    expect(cells).toHaveLength(34); // 06:00 ... 22:30
    const at = byStart(cells);
    expect(at["07:30"]!.status).toBe("FREE");
    for (const start of ["08:00", "08:30", "09:00", "09:30"]) {
      expect(at[start]).toMatchObject({
        status: "BLOCKED",
        blockId: "00000000-0000-4000-8000-000000000001",
        blockReason: "MAINTENANCE",
      });
    }
    expect(at["10:00"]!.status).toBe("FREE");
  });

  it("shortens the last cell when a window doesn't end on a step", () => {
    const odd: CourtCalendar = {
      ...calendar,
      windows: [{ weekday: 1, opensMinute: 375, closesMinute: 420 }], // 06:15-07:00
    };
    const cells = gridForDay(odd, MONDAY, LONG_AGO);
    expect(cells.map((c) => [c.start, c.endsAt])).toEqual([
      ["06:15", "2026-12-21T01:15:00.000Z"],
      ["06:45", "2026-12-21T01:30:00.000Z"],
    ]);
  });

  it("marks cells that have started as past", () => {
    const now = new Date("2026-12-21T05:00:00Z"); // 10:30 IST
    const at = byStart(gridForDay(calendar, MONDAY, now));
    expect(at["07:00"]!.status).toBe("PAST");
    expect(at["10:00"]!.status).toBe("PAST");
    expect(at["10:30"]!.status).toBe("FREE");
  });
});

describe("nextFree", () => {
  it("finds the next free slots, moving on to later days", () => {
    const now = new Date("2026-12-21T16:00:00Z"); // Mon 21:30 IST
    const slots = nextFree(calendar, MONDAY, 60, null, now);
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-12-21T16:00:00.000Z", // Mon 21:30
      "2026-12-21T16:30:00.000Z", // Mon 22:00
      "2026-12-26T12:30:00.000Z", // Sat 18:00
    ]);
  });

  it("skips blocked and unpriced slots", () => {
    const now = new Date("2026-12-21T02:00:00Z"); // Mon 07:30 IST
    const unpriced: CourtCalendar = {
      ...calendar,
      book: { basePricePerHourPaise: null, rules: book.rules },
    };
    const slots = nextFree(unpriced, MONDAY, 60, null, now, { count: 1 });
    expect(slots.map((s) => s.start)).toEqual(["18:00"]);
  });
});
