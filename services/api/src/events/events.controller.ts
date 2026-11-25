import {
  Controller,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Sse,
  type MessageEvent,
} from "@nestjs/common";
import { SLOT_CHANGED } from "@yoorker/contracts";
import type { Db } from "@yoorker/db";
import { interval, map, merge, type Observable } from "rxjs";
import { Public } from "../auth/public.decorator";
import { DB } from "../database/database.module";
import { SlotEvents } from "./slot-events";

const HEARTBEAT_MS = 25_000;

@Controller("venues/:venueId")
export class EventsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly slotEvents: SlotEvents,
  ) {}

  @Public()
  @Sse("events")
  async events(
    @Param("venueId", new ParseUUIDPipe()) venueId: string,
  ): Promise<Observable<MessageEvent>> {
    const venue = await this.db
      .selectFrom("venue")
      .select("id")
      .where("id", "=", venueId)
      .where("is_active", "=", true)
      .executeTakeFirst();
    if (!venue) throw new NotFoundException("Venue not found");
    return merge(
      this.slotEvents.forVenue(venueId).pipe(map((data) => ({ type: SLOT_CHANGED, data }))),
      interval(HEARTBEAT_MS).pipe(map(() => ({ type: "ping", data: "" }))),
    );
  }
}
