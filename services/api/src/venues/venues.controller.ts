import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import {
  createCourtSchema,
  createOrganisationSchema,
  createVenueSchema,
  updateCourtSchema,
  updateVenueSchema,
  type AuditEntry,
  type Court,
  type CreateCourt,
  type CreateOrganisation,
  type CreateVenue,
  type Organisation,
  type UpdateCourt,
  type UpdateVenue,
  type Venue,
} from "@yoorker/contracts";
import { CurrentActor, type Actor } from "../common/actor";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { VenuesService } from "./venues.service";

const id = new ParseUUIDPipe();

@Controller("organisations")
export class OrganisationsController {
  constructor(private readonly venues: VenuesService) {}

  @Post()
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createOrganisationSchema)) body: CreateOrganisation,
  ): Promise<Organisation> {
    return this.venues.createOrganisation(actor, body);
  }

  @Get()
  list(@CurrentActor() actor: Actor): Promise<Organisation[]> {
    return this.venues.listOrganisations(actor.userId);
  }

  @Get(":organisationId/venues")
  listVenues(
    @CurrentActor() actor: Actor,
    @Param("organisationId", id) organisationId: string,
  ): Promise<Venue[]> {
    return this.venues.listVenues(actor, organisationId);
  }

  @Post(":organisationId/venues")
  createVenue(
    @CurrentActor() actor: Actor,
    @Param("organisationId", id) organisationId: string,
    @Body(new ZodValidationPipe(createVenueSchema)) body: CreateVenue,
  ): Promise<Venue> {
    return this.venues.createVenue(actor, organisationId, body);
  }

  @Get(":organisationId/audit-log")
  auditLog(
    @CurrentActor() actor: Actor,
    @Param("organisationId", id) organisationId: string,
  ): Promise<AuditEntry[]> {
    return this.venues.listAudit(actor, organisationId);
  }
}

@Controller("venues")
export class VenuesController {
  constructor(private readonly venues: VenuesService) {}

  @Get(":venueId")
  get(@CurrentActor() actor: Actor, @Param("venueId", id) venueId: string): Promise<Venue> {
    return this.venues.getVenue(actor, venueId);
  }

  @Patch(":venueId")
  update(
    @CurrentActor() actor: Actor,
    @Param("venueId", id) venueId: string,
    @Body(new ZodValidationPipe(updateVenueSchema)) body: UpdateVenue,
  ): Promise<Venue> {
    return this.venues.updateVenue(actor, venueId, body);
  }

  @Get(":venueId/courts")
  listCourts(
    @CurrentActor() actor: Actor,
    @Param("venueId", id) venueId: string,
  ): Promise<Court[]> {
    return this.venues.listCourts(actor, venueId);
  }

  @Post(":venueId/courts")
  createCourt(
    @CurrentActor() actor: Actor,
    @Param("venueId", id) venueId: string,
    @Body(new ZodValidationPipe(createCourtSchema)) body: CreateCourt,
  ): Promise<Court> {
    return this.venues.createCourt(actor, venueId, body);
  }
}

@Controller("courts")
export class CourtsController {
  constructor(private readonly venues: VenuesService) {}

  @Patch(":courtId")
  update(
    @CurrentActor() actor: Actor,
    @Param("courtId", id) courtId: string,
    @Body(new ZodValidationPipe(updateCourtSchema)) body: UpdateCourt,
  ): Promise<Court> {
    return this.venues.updateCourt(actor, courtId, body);
  }
}
