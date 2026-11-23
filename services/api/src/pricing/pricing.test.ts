import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDays,
  hourlyParts,
  quote,
  type BookingTime,
  type PriceBook,
  type StoredPriceRule,
} from "./pricing";

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [6, 7];
const ALL_WEEK = [1, 2, 3, 4, 5, 6, 7];

function rule(
  overrides: Partial<StoredPriceRule> & Pick<StoredPriceRule, "name">,
): StoredPriceRule {
  return {
    weekdays: ALL_WEEK,
    onDate: null,
    fromMinute: 0,
    toMinute: 1440,
    minutes: null,
    unit: "PER_HOUR",
    pricePaise: 0,
    priority: 0,
    ...overrides,
  };
}

const at = (
  date: string,
  time: string,
  minutes: number,
  packagePricePaise: number | null = null,
) => {
  const [h, m] = time.split(":").map(Number);
  return { date, startMinute: h! * 60 + m!, minutes, packagePricePaise };
};

const TUESDAY = "2026-12-22";
const FRIDAY = "2026-12-18";
const SATURDAY = "2026-12-19";
const SUNDAY = "2026-12-20";
const T20 = 210;

describe("example: cricket ground in Rohtak, priced per 3 h 30 m slot", () => {
  const slot = (name: string, days: number[], from: number, to: number, rupees: number) =>
    rule({
      name,
      weekdays: days,
      fromMinute: from * 60,
      toMinute: to * 60,
      minutes: T20,
      unit: "PER_BOOKING",
      pricePaise: rupees * 100,
    });
  const rohtak: PriceBook = {
    basePricePerHourPaise: null,
    rules: [
      slot("Morning", WEEKDAYS, 6, 12, 3000),
      slot("Weekend morning", WEEKEND, 6, 12, 3500),
      slot("Afternoon", WEEKDAYS, 12, 17, 3500),
      slot("Weekend afternoon", WEEKEND, 12, 17, 4000),
      slot("Evening", WEEKDAYS, 17, 21, 5000),
      slot("Weekend evening", WEEKEND, 17, 21, 6000),
      slot("Night", WEEKDAYS, 21, 30, 6000), // 9 PM to 6 AM the next day
      slot("Weekend night", WEEKEND, 21, 30, 7000),
    ],
  };
  const price = (booking: BookingTime) => quote(rohtak, booking);

  it("charges the whole slot by the day and time it starts", () => {
    expect(price(at(TUESDAY, "17:30", T20))).toEqual({
      pricePaise: 500_000,
      source: "BOOKING_RULE",
      ruleName: "Evening",
      parts: [],
    });
    expect(price(at(SATURDAY, "17:30", T20))?.pricePaise).toBe(600_000);
    expect(price(at(TUESDAY, "21:00", T20))?.pricePaise).toBe(600_000);
    expect(price(at(SUNDAY, "21:00", T20))?.pricePaise).toBe(700_000);
    expect(price(at(TUESDAY, "09:00", T20))?.ruleName).toBe("Morning");
  });

  it("keeps Friday night at Friday's price after midnight", () => {
    // Friday 9 PM ends on Saturday at 12:30 AM; a slot starting at 00:30 on Saturday is still
    // Friday night.
    expect(price(at(FRIDAY, "21:00", T20))?.ruleName).toBe("Night");
    expect(price(at(SATURDAY, "00:30", T20))?.ruleName).toBe("Night");
    expect(price(at(SATURDAY, "21:00", T20))?.ruleName).toBe("Weekend night");
  });

  it("has no price for a length the owner didn't price", () => {
    expect(price(at(TUESDAY, "17:30", 60))).toBeNull();
  });
});

describe("example: football turf in Gurugram, priced per hour", () => {
  const gurugram: PriceBook = {
    basePricePerHourPaise: 120_000,
    rules: [
      rule({
        name: "Evening",
        fromMinute: 18 * 60,
        toMinute: 1440,
        pricePaise: 160_000,
        priority: 10,
      }),
      rule({ name: "Weekend", weekdays: WEEKEND, pricePaise: 180_000, priority: 20 }),
    ],
  };
  const price = (booking: BookingTime) => quote(gurugram, booking);

  it("uses the base price when no rule matches", () => {
    expect(price(at(TUESDAY, "10:00", 60))).toEqual({
      pricePaise: 120_000,
      source: "HOURLY",
      ruleName: null,
      parts: [{ from: "10:00", minutes: 60, pricePerHourPaise: 120_000, ruleName: null }],
    });
  });

  it("splits a booking that crosses into the evening price", () => {
    expect(price(at(TUESDAY, "17:00", 120))).toMatchObject({
      pricePaise: 280_000,
      parts: [
        { from: "17:00", minutes: 60, pricePerHourPaise: 120_000, ruleName: null },
        { from: "18:00", minutes: 60, pricePerHourPaise: 160_000, ruleName: "Evening" },
      ],
    });
    expect(price(at(TUESDAY, "17:30", 90))?.pricePaise).toBe(220_000); // 600 + 1,600
    expect(price(at(TUESDAY, "17:45", 45))?.pricePaise).toBe(110_000); // 300 + 800
  });

  it("lets the higher priority win where rules overlap", () => {
    expect(price(at(SATURDAY, "19:00", 60))).toMatchObject({
      pricePaise: 180_000,
      parts: [{ ruleName: "Weekend" }],
    });
  });

  it("uses a length's package price, unless a whole-booking rule covers it", () => {
    expect(price(at(TUESDAY, "10:00", T20, 1_500_000))).toMatchObject({
      pricePaise: 1_500_000,
      source: "PACKAGE",
    });
    const withSlotRule: PriceBook = {
      ...gurugram,
      rules: [
        ...gurugram.rules,
        rule({ name: "T20 morning", minutes: T20, unit: "PER_BOOKING", pricePaise: 1_200_000 }),
      ],
    };
    expect(quote(withSlotRule, at(TUESDAY, "10:00", T20, 1_500_000))?.pricePaise).toBe(1_200_000);
  });
});

describe("example: badminton hall in Pune with a New Year's Eve price", () => {
  const pune: PriceBook = {
    basePricePerHourPaise: 40_000,
    rules: [
      rule({
        name: "Thursday league",
        weekdays: [4],
        fromMinute: 18 * 60,
        toMinute: 22 * 60,
        pricePaise: 50_000,
        priority: 100,
      }),
      rule({ name: "New Year's Eve", weekdays: [], onDate: "2026-12-31", pricePaise: 60_000 }),
    ],
  };

  it("lets a date rule beat any weekday rule, whatever its priority", () => {
    expect(quote(pune, at("2026-12-24", "19:00", 60))?.pricePaise).toBe(50_000);
    expect(quote(pune, at("2026-12-31", "19:00", 60))?.pricePaise).toBe(60_000);
    expect(quote(pune, at("2027-01-01", "19:00", 60))?.pricePaise).toBe(40_000);
  });

  it("has no price where neither a rule nor a base price applies", () => {
    expect(quote({ ...pune, basePricePerHourPaise: null }, at(TUESDAY, "10:00", 60))).toBeNull();
  });
});

const DATES = Array.from({ length: 21 }, (_, i) => addDays("2026-12-14", i));
const quarter = (max: number) => fc.integer({ min: 0, max: max / 15 }).map((n) => n * 15);
const rupees = fc.integer({ min: 0, max: 10_000 }).map((r) => r * 100);

const hourlyRule: fc.Arbitrary<StoredPriceRule> = fc
  .record({
    weekdays: fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { minLength: 1, maxLength: 7 }),
    onDate: fc.option(fc.constantFrom(...DATES), { freq: 4 }),
    fromMinute: quarter(1425),
    length: quarter(1425).map((m) => m + 15),
    pricePaise: rupees,
    priority: fc.integer({ min: 0, max: 3 }),
  })
  .map(({ weekdays, onDate, fromMinute, length, pricePaise, priority }) =>
    rule({
      name: "Rule",
      weekdays: onDate === null ? weekdays : [],
      onDate,
      fromMinute,
      toMinute: fromMinute + length,
      pricePaise,
      priority,
    }),
  );

const book: fc.Arbitrary<PriceBook> = fc.record({
  basePricePerHourPaise: rupees,
  rules: fc.array(hourlyRule, { maxLength: 8 }),
});

const booking = fc.record({
  date: fc.constantFrom(...DATES),
  startMinute: quarter(1425),
  minutes: quarter(705).map((m) => m + 15),
  packagePricePaise: fc.constant(null),
});

describe("pricing properties (TURF-202)", () => {
  it("always prices a court with a base price, in whole rupees, never negative", () => {
    fc.assert(
      fc.property(book, booking, (b, t) => {
        const result = quote(b, t);
        expect(result).not.toBeNull();
        expect(result!.pricePaise).toBeGreaterThanOrEqual(0);
        expect(result!.pricePaise % 100).toBe(0);
      }),
    );
  });

  it("adds up: a booking costs the same as its two halves", () => {
    fc.assert(
      fc.property(book, booking, fc.integer({ min: 1, max: 47 }), (b, t, cut) => {
        fc.pre(cut * 15 < t.minutes);
        const whole = hourlyParts(b, t)!.totalPaise;
        const first = hourlyParts(b, { ...t, minutes: cut * 15 })!.totalPaise;
        const rest = hourlyParts(b, {
          ...t,
          startMinute: t.startMinute + cut * 15,
          minutes: t.minutes - cut * 15,
        })!.totalPaise;
        expect(whole).toBe(first + rest);
      }),
    );
  });

  it("never charges less for a longer booking from the same start", () => {
    fc.assert(
      fc.property(book, booking, (b, t) => {
        fc.pre(t.minutes < 720);
        const shorter = quote(b, t)!.pricePaise;
        const longer = quote(b, { ...t, minutes: t.minutes + 15 })!.pricePaise;
        expect(longer).toBeGreaterThanOrEqual(shorter);
      }),
    );
  });

  it("charges the highest-priority rule, the first listed on a tie", () => {
    const allDay = fc.record({ pricePaise: rupees, priority: fc.integer({ min: 0, max: 3 }) });
    fc.assert(
      fc.property(fc.array(allDay, { minLength: 1, maxLength: 6 }), booking, (rules, t) => {
        const b: PriceBook = {
          basePricePerHourPaise: 0,
          rules: rules.map((r, i) => rule({ name: `Rule ${i}`, ...r })),
        };
        const top = Math.max(...rules.map((r) => r.priority));
        const winner = rules.find((r) => r.priority === top)!;
        expect(quote(b, { ...t, minutes: 60 })!.pricePaise).toBe(winner.pricePaise);
      }),
    );
  });

  it("gives the same price counted from either midnight", () => {
    fc.assert(
      fc.property(book, booking, (b, t) => {
        fc.pre(t.startMinute + t.minutes <= 1440);
        const nextDay = { ...t, date: addDays(t.date, 1) };
        const fromDayBefore = { ...t, startMinute: t.startMinute + 1440 };
        expect(hourlyParts(b, fromDayBefore)!.totalPaise).toBe(hourlyParts(b, nextDay)!.totalPaise);
      }),
    );
  });
});
