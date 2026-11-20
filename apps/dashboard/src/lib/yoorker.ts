/** Shapes returned by the Yoorker API (packages/contracts in the main repo). */

export type Role = "OWNER" | "MANAGER" | "STAFF";
export type Sport = "FOOTBALL" | "CRICKET" | "BADMINTON" | "PICKLEBALL" | "TENNIS" | "BASKETBALL";
export type Surface =
  "ARTIFICIAL_TURF" | "NATURAL_GRASS" | "HARD_COURT" | "SYNTHETIC" | "WOODEN" | "CLAY";

export interface Me {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    phoneVerified: boolean;
  };
  memberships: { organisationId: string; role: Role }[];
}

export interface Organisation {
  id: string;
  name: string;
  role: Role;
}

export interface Venue {
  id: string;
  organisationId: string;
  slug: string;
  name: string;
  address: string;
  city: { slug: string; name: string; state: string };
  locality: string | null;
  pincode: string | null;
  location: { lat: number; lng: number };
  timezone: string;
  amenities: string[];
  rules: string[];
  isActive: boolean;
}

export interface Court {
  id: string;
  venueId: string;
  name: string;
  sports: Sport[];
  surface: Surface;
  capacity: number;
  isActive: boolean;
}

export interface CourtDuration {
  minutes: number;
  label: string | null;
  sport: Sport | null;
  pricePaise: number | null;
}

export interface CourtSchedule {
  courtId: string;
  timezone: string;
  startStepMinutes: number;
  durations: CourtDuration[];
  alwaysOpen: boolean;
  days: { weekday: number; windows: { opens: string; closes: string }[] }[];
}

export interface PriceRule {
  name: string;
  weekdays: number[];
  onDate: string | null;
  from: string;
  to: string;
  minutes: number | null;
  unit: "PER_HOUR" | "PER_BOOKING";
  pricePaise: number;
  priority: number;
}

export interface CourtPrices {
  courtId: string;
  basePricePerHourPaise: number | null;
  rules: PriceRule[];
}

export type SlotStatus = "FREE" | "HELD" | "BOOKED" | "BLOCKED" | "PAST";
export type BlockReason = "MAINTENANCE" | "PRIVATE_EVENT" | "HOLIDAY" | "OTHER";

export interface Slot {
  startsAt: string;
  endsAt: string;
  start: string;
  end: string;
  status: SlotStatus;
  pricePaise: number | null;
  ruleName: string | null;
}

export interface CourtSlots {
  courtId: string;
  date: string;
  minutes: number;
  timezone: string;
  slots: Slot[];
}

export interface GridCell {
  start: string;
  startsAt: string;
  endsAt: string;
  status: SlotStatus;
  blockId: string | null;
  blockReason: BlockReason | null;
}

export interface CourtGrid {
  courtId: string;
  timezone: string;
  startStepMinutes: number;
  days: { date: string; cells: GridCell[] }[];
}

export const SPORT_LABEL: Record<Sport, string> = {
  FOOTBALL: "Football",
  CRICKET: "Cricket",
  BADMINTON: "Badminton",
  PICKLEBALL: "Pickleball",
  TENNIS: "Tennis",
  BASKETBALL: "Basketball",
};

export const SURFACE_LABEL: Record<Surface, string> = {
  ARTIFICIAL_TURF: "Artificial turf",
  NATURAL_GRASS: "Natural grass",
  HARD_COURT: "Hard court",
  SYNTHETIC: "Synthetic",
  WOODEN: "Wooden",
  CLAY: "Clay",
};

export const REASON_LABEL: Record<BlockReason, string> = {
  MAINTENANCE: "Maintenance",
  PRIVATE_EVENT: "Private event",
  HOLIDAY: "Holiday",
  OTHER: "Other",
};

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** ₹1,56,497: whole rupees with Indian grouping. */
export function inr(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

/** ₹1.6L, ₹42K: for chart labels. */
export function inrCompact(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(rupees >= 1000000 ? 0 : 1)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(rupees >= 10000 ? 0 : 1)}K`;
  return `₹${Math.round(rupees)}`;
}

/** 210 → "3 h 30 m" */
export function lengthLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} h` : "", m ? `${m} m` : ""].filter(Boolean).join(" ");
}

/** Today's date at the venue (IST for every Indian venue), "YYYY-MM-DD". */
export function todayAt(timeZone = "Asia/Kolkata", offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "2026-11-19" → "Thu 19 Nov" */
export function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
