import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { OutboxRelay } from "./outbox-relay";
import { SlotEvents } from "./slot-events";

@Module({
  controllers: [EventsController],
  providers: [OutboxRelay, SlotEvents],
})
export class EventsModule {}
