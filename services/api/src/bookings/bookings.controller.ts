import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res } from "@nestjs/common";
import { createBookingSchema, type Booking, type CreateBooking } from "@yoorker/contracts";
import type { Response } from "express";
import { CurrentActor, type Actor } from "../common/actor";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BookingsService } from "./bookings.service";

const id = new ParseUUIDPipe();

@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post("courts/:courtId/bookings")
  async hold(
    @CurrentActor() actor: Actor,
    @Param("courtId", id) courtId: string,
    @Body(new ZodValidationPipe(createBookingSchema)) body: CreateBooking,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Booking> {
    const { booking, created } = await this.bookings.hold(actor, courtId, body);
    res.status(created ? 201 : 200);
    return booking;
  }

  @Get("bookings/:bookingId")
  get(@CurrentActor() actor: Actor, @Param("bookingId", id) bookingId: string): Promise<Booking> {
    return this.bookings.get(actor, bookingId);
  }

  @Post("bookings/:bookingId/cancel")
  @HttpCode(200)
  cancel(
    @CurrentActor() actor: Actor,
    @Param("bookingId", id) bookingId: string,
  ): Promise<Booking> {
    return this.bookings.cancelHold(actor, bookingId);
  }
}
