import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from "@nestjs/common";
import {
  priceQuoteQuerySchema,
  updateCourtPricesSchema,
  type CourtPrices,
  type PriceQuote,
  type PriceQuoteQuery,
  type UpdateCourtPrices,
} from "@yoorker/contracts";
import { CurrentActor, type Actor } from "../common/actor";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PricingService } from "./pricing.service";

const id = new ParseUUIDPipe();

@Controller("courts/:courtId")
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get("prices")
  get(@CurrentActor() actor: Actor, @Param("courtId", id) courtId: string): Promise<CourtPrices> {
    return this.pricing.getPrices(actor, courtId);
  }

  @Put("prices")
  replace(
    @CurrentActor() actor: Actor,
    @Param("courtId", id) courtId: string,
    @Body(new ZodValidationPipe(updateCourtPricesSchema)) body: UpdateCourtPrices,
  ): Promise<CourtPrices> {
    return this.pricing.updatePrices(actor, courtId, body);
  }

  @Get("quote")
  quote(
    @CurrentActor() actor: Actor,
    @Param("courtId", id) courtId: string,
    @Query(new ZodValidationPipe(priceQuoteQuerySchema)) query: PriceQuoteQuery,
  ): Promise<PriceQuote> {
    return this.pricing.quote(actor, courtId, query);
  }
}
