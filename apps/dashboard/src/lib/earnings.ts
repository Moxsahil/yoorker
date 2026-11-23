/**
 * Money for a period, worked out from bookings. SAMPLE until payments arrive (Sprints 5-7):
 * the sample bookings have no payment method, so one is picked from the booking's id, the same
 * way on every load.
 */
import type { DemoBooking } from "./demo-data";
import { addDays, type DateRange } from "./period";

export const COMMISSION_RATE = 0.05;

export type Method = "UPI" | "CARD" | "CASH" | "COUNTER_UPI";

export const METHOD_LABEL: Record<Method, string> = {
  UPI: "UPI",
  CARD: "Card",
  CASH: "Cash",
  COUNTER_UPI: "UPI at counter",
};

export const ONLINE: Method[] = ["UPI", "CARD"];

const hash = (text: string) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

function methodOf(b: DemoBooking): Method {
  const roll = hash(b.id) % 100;
  if (b.source === "ONLINE") return roll < 72 ? "UPI" : "CARD";
  return roll < 55 ? "CASH" : "COUNTER_UPI";
}

export type TxStatus = "PAID" | "REFUNDED" | "PENDING";

export interface Transaction {
  booking: DemoBooking;
  method: Method;
  amountPaise: number;
  status: TxStatus;
}

export interface EarningsSummary {
  bookingValuePaise: number;
  bookings: number;
  onlinePaise: number;
  upiPaise: number;
  cardPaise: number;
  venuePaise: number;
  cashPaise: number;
  counterPaise: number;
  refundsPaise: number;
  refunds: number;
  commissionPaise: number;
  payoutPaise: number;
  netPaise: number;
  pendingPaise: number;
}

const inRange = (b: DemoBooking, range: DateRange, today: string) =>
  b.date >= range.from && b.date <= range.to && b.date <= today;

export function summarise(all: DemoBooking[], range: DateRange, today: string): EarningsSummary {
  const s: EarningsSummary = {
    bookingValuePaise: 0,
    bookings: 0,
    onlinePaise: 0,
    upiPaise: 0,
    cardPaise: 0,
    venuePaise: 0,
    cashPaise: 0,
    counterPaise: 0,
    refundsPaise: 0,
    refunds: 0,
    commissionPaise: 0,
    payoutPaise: 0,
    netPaise: 0,
    pendingPaise: 0,
  };
  for (const b of all) {
    if (!inRange(b, range, today)) continue;
    const method = methodOf(b);
    const online = ONLINE.includes(method);
    if (b.booking !== "CANCELLED") {
      s.bookingValuePaise += b.pricePaise;
      s.bookings++;
    }
    if (b.payment === "NOT_PAID") s.pendingPaise += b.pricePaise;
    if (b.payment === "PAID" || (b.payment === "REFUNDED" && online)) {
      if (online) {
        s.onlinePaise += b.pricePaise;
        if (method === "UPI") s.upiPaise += b.pricePaise;
        else s.cardPaise += b.pricePaise;
      } else {
        s.venuePaise += b.pricePaise;
        if (method === "CASH") s.cashPaise += b.pricePaise;
        else s.counterPaise += b.pricePaise;
      }
    }
    if (b.payment === "REFUNDED" && online) {
      s.refundsPaise += b.pricePaise;
      s.refunds++;
    }
  }
  s.commissionPaise = Math.round((s.onlinePaise - s.refundsPaise) * COMMISSION_RATE);
  s.payoutPaise = s.onlinePaise - s.refundsPaise - s.commissionPaise;
  s.netPaise = s.payoutPaise + s.venuePaise;
  return s;
}

export function transactions(all: DemoBooking[], range: DateRange, today: string): Transaction[] {
  return all
    .filter(
      (b) => inRange(b, range, today) && (b.payment !== "REFUNDED" || ONLINE.includes(methodOf(b))),
    )
    .map((b) => ({
      booking: b,
      method: methodOf(b),
      amountPaise: b.payment === "REFUNDED" ? -b.pricePaise : b.pricePaise,
      status: (b.payment === "PAID"
        ? "PAID"
        : b.payment === "REFUNDED"
          ? "REFUNDED"
          : "PENDING") as TxStatus,
    }))
    .sort((a, b) =>
      `${b.booking.date}${b.booking.start}`.localeCompare(`${a.booking.date}${a.booking.start}`),
    );
}

interface Payout {
  week: string;
  paidOn: string;
  amountPaise: number;
  status: "PAID" | "UPCOMING";
}

export function payouts(all: DemoBooking[], today: string, weeks = 6): Payout[] {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const thisMonday = addDays(today, -weekday);
  return Array.from({ length: weeks }, (_, i) => {
    const week = addDays(thisMonday, -7 * i);
    const range = { from: week, to: addDays(week, 6), days: 7 };
    const paidOn = addDays(week, 7);
    return {
      week,
      paidOn,
      amountPaise: summarise(all, range, today).payoutPaise,
      status: paidOn <= today ? "PAID" : "UPCOMING",
    } satisfies Payout;
  });
}
