/**
 * SAMPLE DATA for Offers (Sprint 9) and Reviews (Sprint 10). Fixed lists, so
 * the pages look the same on every load. Court names come from the real venue when there is one.
 */
import { addDays } from "./period";

export interface Offer {
  id: string;
  name: string;
  code: string | null;
  kind: "PERCENT" | "FLAT";
  value: number;
  weekdays: number[];
  from: string;
  to: string;
  courts: string[] | null;
  validFrom: string;
  validTo: string | null;
  used: number;
  limit: number | null;
  givenPaise: number;
  enabled: boolean;
}

export function demoOffers(today: string, courts: string[]): Offer[] {
  const turfs = courts.filter((c) => !/cricket/i.test(c));
  return [
    {
      id: "o1",
      name: "Weekday morning",
      code: null,
      kind: "PERCENT",
      value: 20,
      weekdays: [1, 2, 3, 4, 5],
      from: "06:00",
      to: "12:00",
      courts: null,
      validFrom: addDays(today, -40),
      validTo: null,
      used: 86,
      limit: null,
      givenPaise: 2_064_000,
      enabled: true,
    },
    {
      id: "o2",
      name: "First booking",
      code: "FIRST100",
      kind: "FLAT",
      value: 100,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      from: "00:00",
      to: "00:00",
      courts: null,
      validFrom: addDays(today, -60),
      validTo: null,
      used: 41,
      limit: null,
      givenPaise: 410_000,
      enabled: true,
    },
    {
      id: "o3",
      name: "Diwali weekend",
      code: "DIWALI15",
      kind: "PERCENT",
      value: 15,
      weekdays: [5, 6, 7],
      from: "16:00",
      to: "00:00",
      courts: turfs.length ? turfs : null,
      validFrom: addDays(today, -24),
      validTo: addDays(today, -15),
      used: 120,
      limit: 120,
      givenPaise: 3_120_000,
      enabled: false,
    },
    {
      id: "o4",
      name: "College league",
      code: "MDU25",
      kind: "PERCENT",
      value: 25,
      weekdays: [1, 2, 3, 4],
      from: "14:00",
      to: "17:00",
      courts: turfs.length ? [turfs[0]!] : null,
      validFrom: addDays(today, 3),
      validTo: addDays(today, 60),
      used: 0,
      limit: 200,
      givenPaise: 0,
      enabled: true,
    },
  ];
}

export type OfferState = "ACTIVE" | "SCHEDULED" | "ENDED" | "PAUSED";

export function offerState(offer: Offer, today: string): OfferState {
  if (offer.validTo && offer.validTo < today) return "ENDED";
  if (offer.limit !== null && offer.used >= offer.limit) return "ENDED";
  if (!offer.enabled) return "PAUSED";
  if (offer.validFrom > today) return "SCHEDULED";
  return "ACTIVE";
}

export interface Review {
  id: string;
  name: string;
  rating: 1 | 2 | 3 | 4 | 5;
  court: string;
  date: string;
  text: string;
  reply: string | null;
}

const REVIEWS: Omit<Review, "id" | "court" | "date">[] = [
  {
    name: "Arjun Verma",
    rating: 5,
    text: "Best turf in the area. Grass is well kept and the floodlights are bright enough for night games.",
    reply: "Thanks Arjun! See you on Saturday.",
  },
  {
    name: "Neha Sharma",
    rating: 4,
    text: "Good ground and easy booking. Parking gets tight on weekend evenings.",
    reply: null,
  },
  {
    name: "Kabir Dahiya",
    rating: 5,
    text: "Played a full T20 match, the 3.5 hour slot was exactly right. Pitch was rolled properly.",
    reply: "Glad the slot worked for your team.",
  },
  {
    name: "Rohan Gupta",
    rating: 2,
    text: "Our 9 PM slot started 15 minutes late because the previous group didn't leave.",
    reply: null,
  },
  {
    name: "Simran Kapoor",
    rating: 5,
    text: "Clean washrooms and drinking water, which is rare. Staff were helpful.",
    reply: null,
  },
  {
    name: "Manav Khanna",
    rating: 3,
    text: "Turf is fine but the nets behind the goal have a few holes.",
    reply: "Thanks for telling us, the nets are being replaced this week.",
  },
  {
    name: "Priya Verma",
    rating: 4,
    text: "Booked online in a minute and got the confirmation on WhatsApp straight away.",
    reply: null,
  },
  {
    name: "Ishaan Yadav",
    rating: 5,
    text: "Weekday morning offer is great value for our office group.",
    reply: null,
  },
  {
    name: "Tanvi Arora",
    rating: 1,
    text: "Cancelled my booking because of rain and still waiting for the refund after 4 days.",
    reply: null,
  },
  {
    name: "Aditya Kapoor",
    rating: 4,
    text: "Good surface, ball runs true. Changing room could use a fan.",
    reply: null,
  },
];

export function demoReviews(today: string, courts: string[]): Review[] {
  const names = courts.length ? courts : ["Turf 1", "Turf 2", "Cricket ground"];
  return REVIEWS.map((review, i) => ({
    ...review,
    id: `r${i + 1}`,
    court: /T20/.test(review.text)
      ? (names.find((c) => /cricket/i.test(c)) ?? names[0]!)
      : names[i % names.length]!,
    date: addDays(today, -[0, 1, 1, 3, 4, 6, 8, 11, 13, 16][i]!),
  }));
}
