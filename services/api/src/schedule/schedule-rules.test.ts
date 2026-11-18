import type { UpdateCourtSchedule } from "@yoorker/contracts";
import { describe, expect, it } from "vitest";
import { isoWeekday, localToUtc } from "./local-time";
import {
  checkSchedule,
  describeMinutes,
  formatClock,
  parseClock,
  startsForDay,
  type StoredWindow,
} from "./schedule-rules";

const IST = "Asia/Kolkata";
const SATURDAY = "2026-12-19";
const MONDAY = "2026-12-21";

const hour = { minutes: 60, label: null, sport: null, pricePaise: null };

function schedule(overrides: Partial<UpdateCourtSchedule> = {}): UpdateCourtSchedule {
  return {
    startStepMinutes: 30,
    durations: [hour],
    days: [{ weekday: 1, windows: [{ opens: "06:00", closes: "23:00" }] }],
    ...overrides,
  };
}

const times = (slots: { startsAt: Date }[]) => slots.map((s) => s.startsAt.toISOString());

describe("clock helpers", () => {
  it("parses and formats local times, wrapping past midnight", () => {
    expect(parseClock("06:30")).toBe(390);
    expect(formatClock(390)).toBe("06:30");
    expect(formatClock(1560)).toBe("02:00");
    expect(formatClock(1440)).toBe("00:00");
    expect(describeMinutes(210)).toBe("3 h 30 m");
    expect(describeMinutes(60)).toBe("1 h");
    expect(describeMinutes(30)).toBe("30 m");
  });

  it("converts IST wall-clock times to UTC", () => {
    expect(isoWeekday(SATURDAY)).toBe(6);
    expect(isoWeekday("2026-12-27")).toBe(7);
    expect(localToUtc(SATURDAY, 18 * 60, IST).toISOString()).toBe("2026-12-19T12:30:00.000Z");
    // 02:00 on Sunday morning, written as minute 1560 of Saturday.
    expect(localToUtc(SATURDAY, 1560, IST).toISOString()).toBe("2026-12-19T20:30:00.000Z");
    expect(() => localToUtc("2026-02-30", 0, IST)).toThrow(RangeError);
  });
});

describe("startsForDay", () => {
  const windows: StoredWindow[] = [
    { weekday: 1, opensMinute: 360, closesMinute: 1380 }, // Mon 06:00-23:00
    { weekday: 6, opensMinute: 1080, closesMinute: 1560 }, // Sat 18:00-02:00
  ];

  it("offers a start every step while the booking still ends by closing time", () => {
    const hourly = startsForDay({ startStepMinutes: 60, windows, timezone: IST }, MONDAY, 60);
    expect(hourly).toHaveLength(17); // 06:00 ... 22:00
    expect(hourly[0]!.startsAt.toISOString()).toBe("2026-12-21T00:30:00.000Z");
    expect(hourly[16]!.endsAt.toISOString()).toBe("2026-12-21T17:30:00.000Z"); // 23:00 IST

    const halfHourly = startsForDay({ startStepMinutes: 30, windows, timezone: IST }, MONDAY, 60);
    expect(halfHourly).toHaveLength(33); // 06:00, 06:30 ... 22:00
  });

  it("lets a T20 start only while it can finish before closing", () => {
    const t20 = startsForDay({ startStepMinutes: 30, windows, timezone: IST }, MONDAY, 210);
    // 06:00 ... 19:30; a T20 from 19:30 ends at 23:00 IST.
    expect(t20).toHaveLength(28);
    expect(t20.at(-1)!.endsAt.toISOString()).toBe("2026-12-21T17:30:00.000Z");
  });

  it("drops a leftover shorter than the booking", () => {
    const morning: StoredWindow[] = [{ weekday: 1, opensMinute: 360, closesMinute: 660 }];
    const slots = startsForDay(
      { startStepMinutes: 90, windows: morning, timezone: IST },
      MONDAY,
      90,
    );
    // 06:00, 07:30, 09:00; 10:30-11:00 is too short.
    expect(times(slots)).toEqual([
      "2026-12-21T00:30:00.000Z",
      "2026-12-21T02:00:00.000Z",
      "2026-12-21T03:30:00.000Z",
    ]);
  });

  it("keeps a window that runs past midnight on the day it opened", () => {
    const slots = startsForDay({ startStepMinutes: 60, windows, timezone: IST }, SATURDAY, 60);
    expect(slots).toHaveLength(8); // 18:00 ... 01:00
    expect(slots.at(-1)!.endsAt.toISOString()).toBe("2026-12-19T20:30:00.000Z"); // Sun 02:00 IST
    expect(
      startsForDay({ startStepMinutes: 60, windows, timezone: IST }, "2026-12-20", 60),
    ).toEqual([]);
  });

  it("gives 24 hourly starts on a 24-hour day", () => {
    const allDay: StoredWindow[] = [{ weekday: 1, opensMinute: 0, closesMinute: 1440 }];
    expect(
      startsForDay({ startStepMinutes: 60, windows: allDay, timezone: IST }, MONDAY, 60),
    ).toHaveLength(24);
  });
});

describe("checkSchedule", () => {
  const issuesOf = (input: UpdateCourtSchedule, sports = ["FOOTBALL"]) =>
    checkSchedule(input, sports).issues;

  it("accepts a normal schedule and stores overnight windows past 1440", () => {
    const { windows, issues } = checkSchedule(
      schedule({ days: [{ weekday: 6, windows: [{ opens: "18:00", closes: "02:00" }] }] }),
      ["FOOTBALL"],
    );
    expect(issues).toEqual([]);
    expect(windows).toEqual([{ weekday: 6, opensMinute: 1080, closesMinute: 1560 }]);
  });

  it("turns alwaysOpen into seven 24-hour windows", () => {
    const { windows } = checkSchedule(
      { startStepMinutes: 60, durations: [hour], alwaysOpen: true },
      [],
    );
    expect(windows).toHaveLength(7);
    expect(windows.every((w) => w.opensMinute === 0 && w.closesMinute === 1440)).toBe(true);
  });

  it("rejects overlapping windows, including across midnight and Sunday into Monday", () => {
    expect(
      issuesOf(
        schedule({
          days: [
            {
              weekday: 1,
              windows: [
                { opens: "06:00", closes: "12:00" },
                { opens: "11:00", closes: "14:00" },
              ],
            },
          ],
        }),
      ),
    ).toEqual([{ path: "days.0.windows.1", message: "Opening hours overlap another window" }]);
    expect(
      issuesOf(
        schedule({
          days: [
            { weekday: 5, windows: [{ opens: "18:00", closes: "02:00" }] },
            { weekday: 6, windows: [{ opens: "01:00", closes: "10:00" }] },
          ],
        }),
      ),
    ).toHaveLength(1);
    expect(
      issuesOf(
        schedule({
          days: [
            { weekday: 7, windows: [{ opens: "20:00", closes: "03:00" }] },
            { weekday: 1, windows: [{ opens: "02:00", closes: "10:00" }] },
          ],
        }),
      ),
    ).toHaveLength(1);
  });

  it("rejects booking lengths that don't fit the step, the court or the hours", () => {
    const issues = issuesOf(
      schedule({
        startStepMinutes: 60,
        days: [{ weekday: 1, windows: [{ opens: "18:00", closes: "21:00" }] }],
        durations: [
          { ...hour, minutes: 90 },
          { ...hour, sport: "CRICKET" },
          hour,
          hour,
          { ...hour, minutes: 240 },
        ],
      }),
    );
    expect(issues).toEqual([
      {
        path: "durations.0.minutes",
        message: "1 h 30 m must be a whole number of 60-minute steps",
      },
      { path: "durations.1.sport", message: "This court doesn't offer CRICKET" },
      { path: "durations.3", message: "This booking length is listed twice" },
      { path: "durations.4.minutes", message: "4 h doesn't fit in any opening window" },
    ]);
  });

  it("allows the same length for two different sports on a multi-sport court", () => {
    expect(
      issuesOf(
        schedule({
          durations: [
            { ...hour, sport: "FOOTBALL" },
            { ...hour, sport: "CRICKET" },
          ],
        }),
        ["FOOTBALL", "CRICKET"],
      ),
    ).toEqual([]);
  });

  it("rejects a weekday listed twice", () => {
    expect(
      issuesOf(
        schedule({
          days: [
            { weekday: 2, windows: [] },
            { weekday: 2, windows: [] },
          ],
        }),
      ),
    ).toEqual([{ path: "days.1.weekday", message: "Each weekday can appear only once" }]);
  });
});
