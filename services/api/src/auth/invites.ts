import type { Database } from "@yoorker/db";
import type { Kysely } from "kysely";

export async function acceptInvites(
  trx: Kysely<Database>,
  userId: string,
  email: string,
): Promise<void> {
  const invites = await trx
    .deleteFrom("member_invite")
    .where("email", "=", email)
    .returning(["organisation_id", "role", "title", "access", "venue_ids"])
    .execute();
  if (invites.length === 0) return;
  await trx
    .insertInto("membership")
    .values(invites.map((invite) => ({ ...invite, user_id: userId })))
    .onConflict((oc) => oc.columns(["organisation_id", "user_id"]).doNothing())
    .execute();
}
