import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import {
  gridQuerySchema,
  slotsQuerySchema,
  type CourtGrid,
  type CourtSlots,
  type GridQuery,
  type SlotsQuery,
} from "@yoorker/contracts";
import { Public } from "../auth/public.decorator";
import { CurrentActor, type Actor } from "../common/actor";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SlotsService } from "./slots.service";

const id = new ParseUUIDPipe();

@Controller("courts/:courtId")
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  /** Public: players browse slots from a shared link before signing in. */
  @Public()
  @Get("slots")
  list(
    @Param("courtId", id) courtId: string,
    @Query(new ZodValidationPipe(slotsQuerySchema)) query: SlotsQuery,
  ): Promise<CourtSlots> {
    return this.slots.publicSlots(courtId, query);
  }

  @Get("grid")
  grid(
    @CurrentActor() actor: Actor,
    @Param("courtId", id) courtId: string,
    @Query(new ZodValidationPipe(gridQuerySchema)) query: GridQuery,
  ): Promise<CourtGrid> {
    return this.slots.grid(actor, courtId, query);
  }
}
