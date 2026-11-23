import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  inviteMemberSchema,
  updateMemberSchema,
  type FeaturesResponse,
  type InviteMember,
  type TeamMember,
  type UpdateMember,
} from "@yoorker/contracts";
import { CurrentActor, type Actor } from "../common/actor";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ENV, type Env } from "../config/env";
import { MembersService } from "./members.service";

const id = new ParseUUIDPipe();

@Controller("organisations/:organisationId/members")
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @Param("organisationId", id) organisationId: string,
  ): Promise<TeamMember[]> {
    return this.members.list(actor, organisationId);
  }

  @Post()
  invite(
    @CurrentActor() actor: Actor,
    @Param("organisationId", id) organisationId: string,
    @Body(new ZodValidationPipe(inviteMemberSchema)) body: InviteMember,
  ): Promise<TeamMember> {
    return this.members.invite(actor, organisationId, body);
  }

  @Patch(":memberId")
  update(
    @CurrentActor() actor: Actor,
    @Param("organisationId", id) organisationId: string,
    @Param("memberId", id) memberId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMember,
  ): Promise<TeamMember> {
    return this.members.update(actor, organisationId, memberId, body);
  }

  @Delete(":memberId")
  @HttpCode(204)
  remove(
    @CurrentActor() actor: Actor,
    @Param("organisationId", id) organisationId: string,
    @Param("memberId", id) memberId: string,
  ): Promise<void> {
    return this.members.remove(actor, organisationId, memberId);
  }
}

@Controller("features")
export class FeaturesController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get()
  get(): FeaturesResponse {
    return { sections: this.env.ENABLED_SECTIONS };
  }
}
