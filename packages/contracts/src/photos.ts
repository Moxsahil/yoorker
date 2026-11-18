import { z } from "zod";

export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const photoContentTypeSchema = z.enum(PHOTO_CONTENT_TYPES);
export type PhotoContentType = z.infer<typeof photoContentTypeSchema>;

/** 10 MB. The dashboard shrinks photos before upload, so real ones are far smaller. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_VENUE = 20;

/** Step 1: ask for an upload link for one photo. */
export const photoUploadRequestSchema = z.object({
  contentType: photoContentTypeSchema,
  size: z.int().min(1).max(MAX_PHOTO_BYTES, "Photos can be at most 10 MB"),
});
export type PhotoUploadRequest = z.infer<typeof photoUploadRequestSchema>;

/** The browser PUTs the file to `uploadUrl` with exactly these headers, before `expiresAt`. */
export const photoUploadSchema = z.object({
  objectKey: z.string(),
  uploadUrl: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
});
export type PhotoUpload = z.infer<typeof photoUploadSchema>;

/** Step 2: after the upload, add the photo to the venue. */
export const addVenuePhotoSchema = z.object({ objectKey: z.string().trim().min(1).max(200) });
export type AddVenuePhoto = z.infer<typeof addVenuePhotoSchema>;

export const venuePhotoSchema = z.object({
  id: z.uuid(),
  venueId: z.uuid(),
  url: z.url(),
  position: z.int(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type VenuePhoto = z.infer<typeof venuePhotoSchema>;
