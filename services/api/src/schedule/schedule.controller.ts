import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from "@nestjs/common";
import {
  updateCourtScheduleSchema,
  type CourtSchedule,
  type UpdateCourtSchedule,
} from "@yoorker/contracts";
import { CurrentActor, type Actor } from "../common/actor";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ScheduleService } from "./schedule.service";

const id = new ParseUUIDPipe();

@Controller("courts/:courtId/schedule")
export class ScheduleController {
  constructor(private readonly schedules: ScheduleService) {}

  @Get()
  get(@CurrentActor() actor: Actor, @Param("courtId", id) courtId: string): Promise<CourtSchedule> {
    return this.schedules.getSchedule(actor, courtId);
  }

  @Put()
  replace(
    @CurrentActor() actor: Actor,
    @Param("courtId", id) courtId: string,
    @Body(new ZodValidationPipe(updateCourtScheduleSchema)) body: UpdateCourtSchedule,
  ): Promise<CourtSchedule> {
    return this.schedules.updateSchedule(actor, courtId, body);
  }
}
