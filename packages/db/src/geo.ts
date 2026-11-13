import { sql } from "kysely";

/** A geography point. Note the order: longitude first, then latitude. */
export function point(lng: number, lat: number) {
  return sql<string>`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
}
