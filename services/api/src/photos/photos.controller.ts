import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import {
  addVenuePhotoSchema,
  photoUploadRequestSchema,
  type AddVenuePhoto,
  type PhotoUpload,
  type PhotoUploadRequest,
  type VenuePhoto,
} from "@yoorker/contracts";
import { CurrentActor, type Actor } from "../common/actor";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PhotosService } from "./photos.service";

const id = new ParseUUIDPipe();

@Controller("venues/:venueId/photos")
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Param("venueId", id) venueId: string): Promise<VenuePhoto[]> {
    return this.photos.listPhotos(actor, venueId);
  }

  @Post("uploads")
  createUpload(
    @CurrentActor() actor: Actor,
    @Param("venueId", id) venueId: string,
    @Body(new ZodValidationPipe(photoUploadRequestSchema)) body: PhotoUploadRequest,
  ): Promise<PhotoUpload> {
    return this.photos.createUpload(actor, venueId, body);
  }

  @Post()
  add(
    @CurrentActor() actor: Actor,
    @Param("venueId", id) venueId: string,
    @Body(new ZodValidationPipe(addVenuePhotoSchema)) body: AddVenuePhoto,
  ): Promise<VenuePhoto> {
    return this.photos.addPhoto(actor, venueId, body);
  }

  @Delete(":photoId")
  @HttpCode(204)
  remove(
    @CurrentActor() actor: Actor,
    @Param("venueId", id) venueId: string,
    @Param("photoId", id) photoId: string,
  ): Promise<void> {
    return this.photos.removePhoto(actor, venueId, photoId);
  }
}
