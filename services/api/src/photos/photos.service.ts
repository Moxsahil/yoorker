import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_VENUE,
  PHOTO_CONTENT_TYPES,
  type AddVenuePhoto,
  type PhotoContentType,
  type PhotoUpload,
  type PhotoUploadRequest,
  type VenuePhoto,
} from "@yoorker/contracts";
import type { Database, Db, MemberRole } from "@yoorker/db";
import { sql, type Kysely } from "kysely";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../common/actor";
import { isUniqueViolation } from "../common/pg-errors";
import { DB } from "../database/database.module";
import { VenuesService } from "../venues/venues.service";
import { PHOTO_STORAGE, type PhotoStorage } from "./photo-storage";

const MANAGERS: readonly MemberRole[] = ["OWNER", "MANAGER"];

const EXTENSIONS: Record<PhotoContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function isPhotoType(type: string | undefined): type is PhotoContentType {
  return (PHOTO_CONTENT_TYPES as readonly (string | undefined)[]).includes(type);
}

function belongsTo(objectKey: string, venueId: string): boolean {
  return new RegExp(`^venues/${venueId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(objectKey);
}

type PhotoRow = {
  id: string;
  venue_id: string;
  object_key: string;
  position: number;
  created_at: Date;
};

const PHOTO_COLUMNS = ["id", "venue_id", "object_key", "position", "created_at"] as const;

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PHOTO_STORAGE) private readonly storage: PhotoStorage,
    private readonly venues: VenuesService,
    private readonly audit: AuditService,
  ) {}

  async listPhotos(actor: Actor, venueId: string): Promise<VenuePhoto[]> {
    await this.venues.getVenue(actor, venueId);
    const rows = await this.db
      .selectFrom("venue_photo")
      .select(PHOTO_COLUMNS)
      .where("venue_id", "=", venueId)
      .orderBy("position")
      .orderBy("created_at")
      .execute();
    return rows.map((row) => this.toPhoto(row));
  }

  async createUpload(
    actor: Actor,
    venueId: string,
    input: PhotoUploadRequest,
  ): Promise<PhotoUpload> {
    await this.venues.getVenue(actor, venueId, MANAGERS);
    if ((await this.countPhotos(this.db, venueId)) >= MAX_PHOTOS_PER_VENUE) {
      throw new ConflictException(`A venue can have at most ${MAX_PHOTOS_PER_VENUE} photos`);
    }
    const objectKey = `venues/${venueId}/${randomUUID()}.${EXTENSIONS[input.contentType]}`;
    const upload = await this.storage.presignUpload(objectKey, input.contentType, input.size);
    return {
      objectKey,
      uploadUrl: upload.url,
      headers: upload.headers,
      expiresAt: upload.expiresAt.toISOString(),
    };
  }

  async addPhoto(actor: Actor, venueId: string, { objectKey }: AddVenuePhoto): Promise<VenuePhoto> {
    const venue = await this.venues.getVenue(actor, venueId, MANAGERS);
    if (!belongsTo(objectKey, venueId)) {
      throw new BadRequestException("That upload doesn't belong to this venue");
    }
    const stored = await this.storage.head(objectKey);
    if (!stored) throw new BadRequestException("Upload the photo before adding it");
    if (stored.size > MAX_PHOTO_BYTES || !isPhotoType(stored.contentType)) {
      await this.storage.delete(objectKey);
      throw new BadRequestException("Photos must be JPEG, PNG or WebP and at most 10 MB");
    }
    try {
      return await this.db.transaction().execute(async (trx) => {
        // Lock the venue so concurrent adds are counted and numbered one at a time.
        await trx.selectFrom("venue").select("id").where("id", "=", venueId).forUpdate().execute();
        if ((await this.countPhotos(trx, venueId)) >= MAX_PHOTOS_PER_VENUE) {
          throw new ConflictException(`A venue can have at most ${MAX_PHOTOS_PER_VENUE} photos`);
        }
        const { next } = await trx
          .selectFrom("venue_photo")
          .select(sql<number>`coalesce(max(position) + 1, 0)::int`.as("next"))
          .where("venue_id", "=", venueId)
          .executeTakeFirstOrThrow();
        const row = await trx
          .insertInto("venue_photo")
          .values({ venue_id: venueId, object_key: objectKey, position: next })
          .returning(PHOTO_COLUMNS)
          .executeTakeFirstOrThrow();
        const photo = this.toPhoto(row);
        await this.audit.record(trx, actor, {
          organisationId: venue.organisationId,
          action: "venue_photo.add",
          entityType: "venue_photo",
          entityId: photo.id,
          after: photo,
        });
        return photo;
      });
    } catch (err) {
      if (isUniqueViolation(err, "venue_photo_object_key_unique")) {
        throw new ConflictException("This photo is already added");
      }
      throw err;
    }
  }

  async removePhoto(actor: Actor, venueId: string, photoId: string): Promise<void> {
    const venue = await this.venues.getVenue(actor, venueId, MANAGERS);
    const removed = await this.db.transaction().execute(async (trx) => {
      const row = await trx
        .deleteFrom("venue_photo")
        .where("id", "=", photoId)
        .where("venue_id", "=", venueId)
        .returning(PHOTO_COLUMNS)
        .executeTakeFirst();
      if (!row) throw new NotFoundException("Photo not found");
      await this.audit.record(trx, actor, {
        organisationId: venue.organisationId,
        action: "venue_photo.remove",
        entityType: "venue_photo",
        entityId: row.id,
        before: this.toPhoto(row),
      });
      return row;
    });
    // After the commit: if this fails, an unused file stays in R2, never a broken photo.
    try {
      await this.storage.delete(removed.object_key);
    } catch (err) {
      this.logger.warn({ err, objectKey: removed.object_key }, "Couldn't delete the photo file");
    }
  }

  private async countPhotos(db: Kysely<Database>, venueId: string): Promise<number> {
    const { count } = await db
      .selectFrom("venue_photo")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("venue_id", "=", venueId)
      .executeTakeFirstOrThrow();
    return count;
  }

  private toPhoto(row: PhotoRow): VenuePhoto {
    return {
      id: row.id,
      venueId: row.venue_id,
      url: this.storage.publicUrl(row.object_key),
      position: row.position,
      createdAt: row.created_at.toISOString(),
    };
  }
}
