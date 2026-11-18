import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { ENV, type Env } from "../config/env";
import { VenuesModule } from "../venues/venues.module";
import { DisabledPhotoStorage, PHOTO_STORAGE } from "./photo-storage";
import { PhotosController } from "./photos.controller";
import { PhotosService } from "./photos.service";
import { R2PhotoStorage } from "./r2-photo-storage";

@Module({
  imports: [VenuesModule],
  controllers: [PhotosController],
  providers: [
    PhotosService,
    AuditService,
    {
      provide: PHOTO_STORAGE,
      inject: [ENV],
      useFactory: (env: Env) => (env.R2 ? new R2PhotoStorage(env.R2) : new DisabledPhotoStorage()),
    },
  ],
})
export class PhotosModule {}
