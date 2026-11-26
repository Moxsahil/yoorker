import type { ColumnType, Generated } from "kysely";

/** Set by the database on insert. The app never writes it. */
type CreatedAt = ColumnType<Date, never, never>;
type UpdatedAt = ColumnType<Date, never, never>;
type Nullable<T> = ColumnType<T | null, T | null | undefined, T | null>;
/** geography(Point, 4326). Write with point(); read with ST_X/ST_Y or ST_AsGeoJSON. */
type Geography = string;
type JsonSnapshot = ColumnType<unknown, object | null | undefined, never>;

export const MEMBER_ROLES = ["OWNER", "MANAGER", "STAFF"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const STAFF_ACCESS = [
  "bookings",
  "checkin",
  "customers",
  "venues",
  "reports",
  "earnings",
  "settings",
] as const;
export type StaffAccess = (typeof STAFF_ACCESS)[number];

export const SPORTS = [
  "FOOTBALL",
  "CRICKET",
  "BADMINTON",
  "PICKLEBALL",
  "TENNIS",
  "BASKETBALL",
] as const;
export type Sport = (typeof SPORTS)[number];

export const COURT_SURFACES = [
  "ARTIFICIAL_TURF",
  "NATURAL_GRASS",
  "HARD_COURT",
  "SYNTHETIC",
  "WOODEN",
  "CLAY",
] as const;
export type CourtSurface = (typeof COURT_SURFACES)[number];

export const PRICE_UNITS = ["PER_HOUR", "PER_BOOKING"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export const BLOCK_REASONS = ["MAINTENANCE", "PRIVATE_EVENT", "HOLIDAY", "OTHER"] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];

export const BOOKING_STATUSES = [
  "HELD",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "EXPIRED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = ["NOT_PAID", "PAID", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const BOOKING_SOURCES = ["ONLINE", "WALK_IN", "PHONE"] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const PRICE_SOURCES = ["BOOKING_RULE", "PACKAGE", "HOURLY"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const BOOKING_MOVES: Record<BookingStatus, readonly BookingStatus[]> = {
  HELD: ["CONFIRMED", "CANCELLED", "EXPIRED"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  EXPIRED: [],
};

export const PAYMENT_MOVES: Record<PaymentStatus, readonly PaymentStatus[]> = {
  NOT_PAID: ["PAID"],
  PAID: ["REFUNDED"],
  REFUNDED: [],
};

export const IDENTITY_PROVIDERS = ["GOOGLE"] as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

export interface AppUserTable {
  id: Generated<string>;
  phone: Nullable<string>; //TODO: Consider making this non-nullable if phone is required for all users.
  phone_verified_at: Nullable<Date>;
  email: Nullable<string>;
  email_verified_at: Nullable<Date>;
  name: Nullable<string>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface OrganisationTable {
  id: Generated<string>;
  name: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface MembershipTable {
  organisation_id: string;
  user_id: string;
  role: MemberRole;
  title: Nullable<string>;
  access: Generated<StaffAccess[]>;
  venue_ids: Nullable<string[]>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface MemberInviteTable {
  id: Generated<string>;
  organisation_id: string;
  email: string;
  name: string;
  role: MemberRole;
  title: string;
  access: StaffAccess[];
  venue_ids: Nullable<string[]>;
  invited_by: Nullable<string>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface CityTable {
  id: Generated<string>;
  slug: string;
  name: string;
  state: string;
  centroid: Geography;
  is_live: Generated<boolean>;
  created_at: CreatedAt;
}

export interface VenueTable {
  id: Generated<string>;
  organisation_id: string;
  city_id: string;
  slug: string;
  name: string;
  address: string;
  locality: Nullable<string>;
  pincode: Nullable<string>;
  location: Geography;
  timezone: Generated<string>;
  amenities: Generated<string[]>;
  rules: Generated<string[]>;
  is_active: Generated<boolean>;
  deleted_at: Nullable<Date>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface VenuePhotoTable {
  id: Generated<string>;
  venue_id: string;
  object_key: string;
  position: Generated<number>;
  created_at: CreatedAt;
}

export interface CourtTable {
  id: Generated<string>;
  venue_id: string;
  name: string;
  sports: Sport[];
  surface: CourtSurface;
  capacity: number;
  is_active: Generated<boolean>;
  start_step_minutes: Generated<number>;
  base_price_per_hour_paise: Nullable<number>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface OpeningHoursTable {
  id: Generated<string>;
  court_id: string;
  weekday: number;
  opens_minute: number;
  /** Up to opens_minute + 1440; above 1440 ends the next day. */
  closes_minute: number;
}

export interface CourtDurationTable {
  id: Generated<string>;
  court_id: string;
  minutes: number;
  label: Nullable<string>;
  sport: Nullable<Sport>;
  price_paise: Nullable<number>;
  position: Generated<number>;
}

export interface PriceRuleTable {
  id: Generated<string>;
  court_id: string;
  name: string;
  weekdays: Generated<number[]>;
  /**
   * A single date, e.g. 2026-12-31. Written as "YYYY-MM-DD"; select it with `on_date::text`,
   * because node-postgres turns a date column into a JS Date at local midnight.
   */
  on_date: Nullable<string>;
  from_minute: number;
  /** Up to from_minute + 1440; above 1440 ends the next day. */
  to_minute: number;
  minutes: Nullable<number>;
  unit: PriceUnit;
  price_paise: number;
  priority: Generated<number>;
  position: Generated<number>;
}

export interface BlackoutTable {
  id: Generated<string>;
  court_id: string;
  /**
   * tstzrange [start, end). Write it with sql`tstzrange(${start}, ${end}, '[)')`; read
   * lower(during) and upper(during), which come back as Dates.
   */
  during: string;
  reason: BlockReason;
  note: Nullable<string>;
  created_by: Nullable<string>;
  created_at: CreatedAt;
}

export interface AuditLogTable {
  /** bigint: node-postgres returns int8 as a string. */
  id: Generated<string>;
  organisation_id: Nullable<string>;
  actor_user_id: Nullable<string>;
  action: string;
  entity_type: string;
  entity_id: string;
  before: JsonSnapshot;
  after: JsonSnapshot;
  request_id: Nullable<string>;
  created_at: CreatedAt;
}

export interface OtpChallengeTable {
  id: Generated<string>;
  phone: string;
  /** HMAC-SHA256 of the code, keyed with OTP_HASH_SECRET and the challenge id. */
  code_hash: string;
  attempts: Generated<number>;
  request_ip: Nullable<string>;
  expires_at: Date;
  consumed_at: Nullable<Date>;
  created_at: CreatedAt;
}

export interface UserSessionTable {
  id: Generated<string>;
  user_id: string;
  /** SHA-256 of the cookie token. The token itself is never stored. */
  token_hash: string;
  user_agent: Nullable<string>;
  ip: Nullable<string>;
  created_at: CreatedAt;
  expires_at: Date;
  revoked_at: Nullable<Date>;
}

export interface UserIdentityTable {
  id: Generated<string>;
  user_id: string;
  provider: IdentityProvider;
  subject: string;
  created_at: CreatedAt;
  last_used_at: Generated<Date>;
}

export interface BookingTable {
  id: Generated<string>;
  number: ColumnType<string, never, never>;
  court_id: string;
  during: string;
  minutes: number;
  sport: string;
  status: Generated<BookingStatus>;
  payment_status: Generated<PaymentStatus>;
  source: BookingSource;
  hold_expires_at: Nullable<Date>;
  player_id: Nullable<string>;
  player_name: Nullable<string>;
  player_phone: Nullable<string>;
  price_paise: number;
  price_source: PriceSource;
  price_rule_name: Nullable<string>;
  idempotency_key: Nullable<string>;
  created_by: Nullable<string>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
  status_changed_at: CreatedAt;
}

export interface OutboxTable {
  /** bigint: node-postgres returns int8 as a string. */
  id: Generated<string>;
  event: string;
  payload: ColumnType<unknown, string, never>;
  created_at: CreatedAt;
  published_at: Nullable<Date>;
}

export interface Database {
  app_user: AppUserTable;
  organisation: OrganisationTable;
  membership: MembershipTable;
  member_invite: MemberInviteTable;
  city: CityTable;
  venue: VenueTable;
  venue_photo: VenuePhotoTable;
  court: CourtTable;
  opening_hours: OpeningHoursTable;
  court_duration: CourtDurationTable;
  price_rule: PriceRuleTable;
  blackout: BlackoutTable;
  booking: BookingTable;
  outbox: OutboxTable;
  audit_log: AuditLogTable;
  otp_challenge: OtpChallengeTable;
  user_session: UserSessionTable;
  user_identity: UserIdentityTable;
}
