import type { ColumnType, Generated } from "kysely";

/** Set by the database on insert. The app never writes it. */
type CreatedAt = ColumnType<Date, never, never>;
/** Kept current by the set_updated_at trigger. */
type UpdatedAt = ColumnType<Date, never, never>;
/** Optional on insert, may be null. */
type Nullable<T> = ColumnType<T | null, T | null | undefined, T | null>;
/** geography(Point, 4326). Write with point(); read with ST_X/ST_Y or ST_AsGeoJSON. */
type Geography = string;
/** jsonb written once (audit log). */
type JsonSnapshot = ColumnType<unknown, object | null | undefined, never>;

export const MEMBER_ROLES = ["OWNER", "MANAGER", "STAFF"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

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
  created_at: CreatedAt;
}

export interface CityTable {
  id: Generated<string>;
  slug: string;
  name: string;
  state: string;
  centroid: Geography;
  /** Cities we actively launch in. Others exist because an owner listed a venue there. */
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
  /** Indian PIN code, 6 digits. */
  pincode: Nullable<string>;
  location: Geography;
  timezone: Generated<string>;
  amenities: Generated<string[]>;
  /** Facility rules shown to players, e.g. "No metal studs". */
  rules: Generated<string[]>;
  is_active: Generated<boolean>;
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
  /** How often a booking can start: 15, 30 or 60 minutes. */
  start_step_minutes: Generated<number>;
  /** Price per hour when no price rule matches; null means no fallback price. */
  base_price_per_hour_paise: Nullable<number>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

/** One opening window in local time. No rows for a court means it is closed. */
export interface OpeningHoursTable {
  id: Generated<string>;
  court_id: string;
  /** ISO weekday: 1 = Monday ... 7 = Sunday. */
  weekday: number;
  /** Minutes after local midnight, 0-1439. */
  opens_minute: number;
  /** Up to opens_minute + 1440; above 1440 ends the next day. */
  closes_minute: number;
}

/** A booking length players can choose on a court. */
export interface CourtDurationTable {
  id: Generated<string>;
  court_id: string;
  minutes: number;
  label: Nullable<string>;
  /** Null means every sport on the court. */
  sport: Nullable<Sport>;
  /** Fixed package price; null means priced per hour. */
  price_paise: Nullable<number>;
  position: Generated<number>;
}

/** An owner's price for some days, hours and booking lengths of a court (TURF-201). */
export interface PriceRuleTable {
  id: Generated<string>;
  court_id: string;
  name: string;
  /** ISO weekdays, 1 = Monday; empty when on_date is set. */
  weekdays: Generated<number[]>;
  /**
   * A single date, e.g. 2026-12-31. Written as "YYYY-MM-DD"; select it with `on_date::text`,
   * because node-postgres turns a date column into a JS Date at local midnight.
   */
  on_date: Nullable<string>;
  from_minute: number;
  /** Up to from_minute + 1440; above 1440 ends the next day. */
  to_minute: number;
  /** Only bookings of this length; null means any length. */
  minutes: Nullable<number>;
  unit: PriceUnit;
  price_paise: number;
  priority: Generated<number>;
  position: Generated<number>;
}

/** Time a court can't be booked (TURF-203). */
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

export interface Database {
  app_user: AppUserTable;
  organisation: OrganisationTable;
  membership: MembershipTable;
  city: CityTable;
  venue: VenueTable;
  venue_photo: VenuePhotoTable;
  court: CourtTable;
  opening_hours: OpeningHoursTable;
  court_duration: CourtDurationTable;
  price_rule: PriceRuleTable;
  blackout: BlackoutTable;
  audit_log: AuditLogTable;
  otp_challenge: OtpChallengeTable;
  user_session: UserSessionTable;
  user_identity: UserIdentityTable;
}
