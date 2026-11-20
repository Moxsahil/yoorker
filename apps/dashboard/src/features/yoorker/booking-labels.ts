import type { Tone } from "@/kit/ui-patterns/status-badge";
import type { BookingLabel, PaymentLabel } from "@/lib/demo-data";

/** What happened to the booking. */
export const BOOKING: Record<BookingLabel, { label: string; tone: Tone }> = {
  CONFIRMED: { label: "Confirmed", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
  NO_SHOW: { label: "No-show", tone: "danger" },
};

/** What happened to the money. */
export const PAYMENT: Record<PaymentLabel, { label: string; tone: Tone }> = {
  PAID: { label: "Paid", tone: "success" },
  NOT_PAID: { label: "Not paid", tone: "warning" },
  REFUNDED: { label: "Refunded", tone: "muted" },
};
