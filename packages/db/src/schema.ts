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

// Keep these lists in sync with migrations; schema.test.ts checks the enums.
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

export interface AppUserTable {
  id: Generated<string>;
  phone: string;
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

export interface VenueTable {
  id: Generated<string>;
  organisation_id: string;
  slug: string;
  name: string;
  address: string;
  location: Geography;
  timezone: Generated<string>;
  amenities: Generated<string[]>;
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
  created_at: CreatedAt;
  updated_at: UpdatedAt;
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

export interface Database {
  app_user: AppUserTable;
  organisation: OrganisationTable;
  membership: MembershipTable;
  venue: VenueTable;
  venue_photo: VenuePhotoTable;
  court: CourtTable;
  audit_log: AuditLogTable;
}
