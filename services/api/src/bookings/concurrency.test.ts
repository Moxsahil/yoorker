import type { AddressInfo } from "node:net";
import { courtSchema, organisationSchema, venueSchema } from "@yoorker/contracts";
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/test-app";

let t: TestApp;
let base: string;
let owner: { cookie: string };
let players: { userId: string; cookie: string }[];
let venueId: string;
let courtId: string;
let keys = 0;

const PLAYERS = 100;
// The test clock starts on Monday 14 Dec 2026 at 06:00 IST.
const MONDAY_6AM = "2026-12-14T00:30:00Z";

interface Reply {
  status: number;
  body: { id?: string; message?: string };
}

async function post(path: string, cookie: string, body: object): Promise<Reply> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Reply["body"] };
}

const hold = (
  cookie: string,
  date: string,
  start: string,
  minutes = 60,
  key = `race-key-${++keys}`,
) => post(`/courts/${courtId}/bookings`, cookie, { date, start, minutes, idempotencyKey: key });

const count = (replies: Reply[], status: number) =>
  replies.filter((r) => r.status === status).length;

async function liveBookings(from: string, to: string) {
  return t.db
    .selectFrom("booking")
    .select(["id", sql<Date>`lower(during)`.as("startsAt"), sql<Date>`upper(during)`.as("endsAt")])
    .where("court_id", "=", courtId)
    .where("status", "in", ["HELD", "CONFIRMED"])
    .where(sql<boolean>`during && tstzrange(${from}::timestamptz, ${to}::timestamptz, '[)')`)
    .orderBy("startsAt")
    .execute();
}

beforeAll(async () => {
  t = await createTestApp();
  await t.app.listen(0, "127.0.0.1");
  base = `http://127.0.0.1:${(t.app.getHttpServer().address() as AddressInfo).port}`;

  owner = await t.signIn("9811100071");
  players = [];
  for (let i = 0; i < PLAYERS; i++) {
    players.push(await t.signInWithGoogle({ subject: `racer-${i}` }));
  }

  const org = await t
    .http()
    .post("/organisations")
    .set("Cookie", owner.cookie)
    .send({ name: "Green Arena" })
    .expect(201);
  const venue = await t
    .http()
    .post(`/organisations/${organisationSchema.parse(org.body).id}/venues`)
    .set("Cookie", owner.cookie)
    .send({
      slug: "green-arena-race",
      name: "Green Arena",
      address: "Sector 57, Gurugram, Haryana",
      location: { lat: 28.4211, lng: 77.0878 },
      city: { name: "Gurugram", state: "Haryana" },
    })
    .expect(201);
  venueId = venueSchema.parse(venue.body).id;
  const court = await t
    .http()
    .post(`/venues/${venueId}/courts`)
    .set("Cookie", owner.cookie)
    .send({ name: "Turf 1", sports: ["FOOTBALL"], surface: "ARTIFICIAL_TURF", capacity: 14 })
    .expect(201);
  courtId = courtSchema.parse(court.body).id;
  await t
    .http()
    .put(`/courts/${courtId}/schedule`)
    .set("Cookie", owner.cookie)
    .send({
      startStepMinutes: 30,
      durations: [{ minutes: 60 }, { minutes: 90 }],
      days: [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        windows: [{ opens: "06:00", closes: "23:00" }],
      })),
    })
    .expect(200);
  await t
    .http()
    .put(`/courts/${courtId}/prices`)
    .set("Cookie", owner.cookie)
    .send({ basePricePerHourPaise: 120_000, rules: [] })
    .expect(200);
});

afterAll(async () => {
  await t?.close();
});

beforeEach(() => {
  t.clock.set(MONDAY_6AM);
});

describe("100 players at once (TURF-304)", () => {
  it("gives a slot to exactly one of 100 players; the other 99 hear it was just taken", async () => {
    const replies = await Promise.all(players.map((p) => hold(p.cookie, "2026-12-14", "18:00")));
    expect(count(replies, 201)).toBe(1);
    expect(count(replies, 409)).toBe(PLAYERS - 1);
    expect(
      replies
        .filter((r) => r.status === 409)
        .every((r) => r.body.message === "Just taken. Pick another time."),
    ).toBe(true);
    expect(await liveBookings("2026-12-14T12:30Z", "2026-12-14T13:30Z")).toHaveLength(1);
  });

  it("never lets overlapping lengths and start times both win", async () => {
    const starts = ["18:00", "18:30", "19:00", "19:30"];
    const replies = await Promise.all(
      players.map((p, i) => hold(p.cookie, "2026-12-15", starts[i % 4]!, i % 2 === 0 ? 60 : 90)),
    );
    expect(count(replies, 201) + count(replies, 409)).toBe(PLAYERS);
    const live = await liveBookings("2026-12-15T12:00Z", "2026-12-15T16:00Z");
    expect(live).toHaveLength(count(replies, 201));
    for (let i = 1; i < live.length; i++) {
      expect(live[i]!.startsAt.getTime()).toBeGreaterThanOrEqual(live[i - 1]!.endsAt.getTime());
    }
  });

  it("creates one booking when a player's request is retried 100 times at once", async () => {
    const cookie = players[0]!.cookie;
    const replies = await Promise.all(
      Array.from({ length: PLAYERS }, () =>
        hold(cookie, "2026-12-16", "10:00", 60, "one-tap-retry-key"),
      ),
    );
    expect(count(replies, 201)).toBe(1);
    expect(count(replies, 200)).toBe(PLAYERS - 1);
    expect(new Set(replies.map((r) => r.body.id)).size).toBe(1);
    expect(await liveBookings("2026-12-16T04:30Z", "2026-12-16T05:30Z")).toHaveLength(1);
  });

  it("lets either a block or one booking win a race between them, never both", async () => {
    const block = post(`/venues/${venueId}/blocks`, owner.cookie, {
      from: "2026-12-17T10:00",
      to: "2026-12-17T11:00",
      reason: "MAINTENANCE",
      courtIds: [courtId],
    });
    const replies = await Promise.all(
      players.slice(0, 50).map((p) => hold(p.cookie, "2026-12-17", "10:00")),
    );
    const blocked = (await block).status === 201;
    expect(count(replies, 201)).toBe(blocked ? 0 : 1);
    expect(count(replies, 201) + count(replies, 409)).toBe(50);
    expect(await liveBookings("2026-12-17T04:30Z", "2026-12-17T05:30Z")).toHaveLength(
      blocked ? 0 : 1,
    );
  });

  it("hands a slot whose hold ran out to exactly one of 100 players", async () => {
    const first = await hold(players[0]!.cookie, "2026-12-18", "10:00");
    expect(first.status).toBe(201);
    t.clock.set("2026-12-14T00:36:00Z");
    const replies = await Promise.all(
      players.slice(1).map((p) => hold(p.cookie, "2026-12-18", "10:00")),
    );
    expect(count(replies, 201)).toBe(1);
    expect(count(replies, 409)).toBe(PLAYERS - 2);
    const old = await t.db
      .selectFrom("booking")
      .select("status")
      .where("id", "=", first.body.id!)
      .executeTakeFirstOrThrow();
    expect(old.status).toBe("EXPIRED");
  });
});
