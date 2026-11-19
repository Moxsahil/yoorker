import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  createBlocksSchema,
  listBlocksQuerySchema,
  type Block,
  type CreateBlocks,
  type ListBlocksQuery,
} from "@yoorker/contracts";
import { CurrentActor, type Actor } from "../common/actor";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BlocksService } from "./blocks.service";

const id = new ParseUUIDPipe();

@Controller()
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Post("venues/:venueId/blocks")
  create(
    @CurrentActor() actor: Actor,
    @Param("venueId", id) venueId: string,
    @Body(new ZodValidationPipe(createBlocksSchema)) body: CreateBlocks,
  ): Promise<Block[]> {
    return this.blocks.createBlocks(actor, venueId, body);
  }

  @Get("courts/:courtId/blocks")
  list(
    @CurrentActor() actor: Actor,
    @Param("courtId", id) courtId: string,
    @Query(new ZodValidationPipe(listBlocksQuerySchema)) query: ListBlocksQuery,
  ): Promise<Block[]> {
    return this.blocks.listBlocks(actor, courtId, query);
  }

  @Delete("blocks/:blockId")
  @HttpCode(204)
  remove(@CurrentActor() actor: Actor, @Param("blockId", id) blockId: string): Promise<void> {
    return this.blocks.removeBlock(actor, blockId);
  }
}
