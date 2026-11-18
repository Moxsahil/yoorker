import { ServiceUnavailableException } from "@nestjs/common";
import {
  auditEntrySchema,
  organisationSchema,
  photoUploadSchema,
  venuePhotoSchema,
  venueSchema,
} from "@yoorker/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/test-app";
import { DisabledPhotoStorage } from "./photo-storage";

let t: TestApp;
let owner: { userId: string; cookie: string };
let staff: { userId: string; cookie: string };
let outsider: { userId: string; cookie: string };
let organisationId: string;
let venueId: string;
let otherVenueId: string;

const JPEG = { contentType: "image/jpeg", size: 250_000 } as const;

async function createVenue(slug: string): Promise<string> {
  const res = await t
    .http()
    .post(`/organisations/${organisationId}/venues`)
    .set("Cookie", owner.cookie)
    .send({
      slug,
      name: "Sector 57 Turf",
      address: "Sector 57, Gurugram, Haryana",
      location: { lat: 28.4211, lng: 77.0878 },
      city: { name: "Gurugram", state: "Haryana" },
    })
    .expect(201);
  return venueSchema.parse(res.body).id;
}

/** Steps 1 and 2 as the dashboard does them; returns the added photo. */
async function uploadPhoto(forVenue = venueId) {
  const asked = await t
    .http()
    .post(`/venues/${forVenue}/photos/uploads`)
    .set("Cookie", owner.cookie)
    .send(JPEG)
    .expect(201);
  const { objectKey } = photoUploadSchema.parse(asked.body);
  t.photos.put(objectKey, JPEG.size, JPEG.contentType);
  const added = await t
    .http()
    .post(`/venues/${forVenue}/photos`)
    .set("Cookie", owner.cookie)
    .send({ objectKey })
    .expect(201);
  return venuePhotoSchema.parse(added.body);
}

beforeAll(async () => {
  t = await createTestApp();
  owner = await t.signIn("9811100011");
  staff = await t.signIn("9811100012");
  outsider = await t.signIn("9811100013");
  const org = await t
    .http()
    .post("/organisations")
    .set("Cookie", owner.cookie)
    .send({ name: "Sector 57 Sports" })
    .expect(201);
  organisationId = organisationSchema.parse(org.body).id;
  await t.db
    .insertInto("membership")
    .values({ organisation_id: organisationId, user_id: staff.userId, role: "STAFF" })
    .execute();
  venueId = await createVenue("sector-57-photos");
  otherVenueId = await createVenue("sector-58-photos");
});

afterAll(async () => {
  await t?.close();
});

describe("venue photos (TURF-103)", () => {
  it("gives the owner an upload link under the venue's folder", async () => {
    const res = await t
      .http()
      .post(`/venues/${venueId}/photos/uploads`)
      .set("Cookie", owner.cookie)
      .send({ contentType: "image/webp", size: 120_000 })
      .expect(201);
    const upload = photoUploadSchema.parse(res.body);
    expect(upload.objectKey).toMatch(new RegExp(`^venues/${venueId}/[0-9a-f-]{36}\\.webp$`));
    expect(upload.headers).toEqual({ "Content-Type": "image/webp" });
    expect(new Date(upload.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("adds uploaded photos in order and lists them with public URLs", async () => {
    const first = await uploadPhoto();
    const second = await uploadPhoto();
    expect(first.position).toBe(0);
    expect(second.position).toBe(1);
    expect(first.url).toMatch(/^https:\/\/photos\.example\.com\/venues\//);

    // Staff can see photos.
    const res = await t
      .http()
      .get(`/venues/${venueId}/photos`)
      .set("Cookie", staff.cookie)
      .expect(200);
    expect(res.body.map((p: { id: string }) => p.id)).toEqual([first.id, second.id]);
  });

  it("rejects unsupported types and files over 10 MB before signing", async () => {
    for (const body of [
      { contentType: "image/gif", size: 1000 },
      { contentType: "image/jpeg", size: 10 * 1024 * 1024 + 1 },
      { contentType: "image/jpeg", size: 0 },
    ]) {
      await t
        .http()
        .post(`/venues/${venueId}/photos/uploads`)
        .set("Cookie", owner.cookie)
        .send(body)
        .expect(400);
    }
  });

  it("refuses to add a photo that was never uploaded or belongs to another venue", async () => {
    const asked = await t
      .http()
      .post(`/venues/${venueId}/photos/uploads`)
      .set("Cookie", owner.cookie)
      .send(JPEG)
      .expect(201);
    const { objectKey } = photoUploadSchema.parse(asked.body);

    const notUploaded = await t
      .http()
      .post(`/venues/${venueId}/photos`)
      .set("Cookie", owner.cookie)
      .send({ objectKey })
      .expect(400);
    expect(notUploaded.body.message).toBe("Upload the photo before adding it");

    t.photos.put(objectKey, JPEG.size, JPEG.contentType);
    for (const key of [objectKey, "venues/../secrets.txt", "invoices/x.pdf"]) {
      await t
        .http()
        .post(`/venues/${otherVenueId}/photos`)
        .set("Cookie", owner.cookie)
        .send({ objectKey: key })
        .expect(400);
    }
  });

  it("deletes a stored file that is not a photo or is too large", async () => {
    for (const [size, type] of [
      [JPEG.size, "text/html"],
      [11 * 1024 * 1024, "image/jpeg"],
    ] as const) {
      const asked = await t
        .http()
        .post(`/venues/${venueId}/photos/uploads`)
        .set("Cookie", owner.cookie)
        .send(JPEG)
        .expect(201);
      const { objectKey } = photoUploadSchema.parse(asked.body);
      t.photos.put(objectKey, size, type);
      await t
        .http()
        .post(`/venues/${venueId}/photos`)
        .set("Cookie", owner.cookie)
        .send({ objectKey })
        .expect(400);
      expect(t.photos.objects.has(objectKey)).toBe(false);
    }
  });

  it("adds each upload only once", async () => {
    const photo = await uploadPhoto();
    const objectKey = new URL(photo.url).pathname.slice(1);
    await t
      .http()
      .post(`/venues/${venueId}/photos`)
      .set("Cookie", owner.cookie)
      .send({ objectKey })
      .expect(409);
  });

  it("removes a photo and its file, and records both changes in the audit log", async () => {
    const photo = await uploadPhoto();
    const objectKey = new URL(photo.url).pathname.slice(1);
    await t
      .http()
      .delete(`/venues/${venueId}/photos/${photo.id}`)
      .set("Cookie", owner.cookie)
      .expect(204);
    expect(t.photos.deleted).toContain(objectKey);
    await t
      .http()
      .delete(`/venues/${venueId}/photos/${photo.id}`)
      .set("Cookie", owner.cookie)
      .expect(404);

    const audit = await t
      .http()
      .get(`/organisations/${organisationId}/audit-log`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const forPhoto = auditEntrySchema
      .array()
      .parse(audit.body)
      .filter((entry) => entry.entityId === photo.id)
      .map((entry) => entry.action);
    expect(forPhoto).toEqual(["venue_photo.remove", "venue_photo.add"]);
  });

  it("lets only owners and managers change photos, and hides venues from outsiders", async () => {
    const photo = await uploadPhoto();
    await t
      .http()
      .post(`/venues/${venueId}/photos/uploads`)
      .set("Cookie", staff.cookie)
      .send(JPEG)
      .expect(403);
    await t
      .http()
      .delete(`/venues/${venueId}/photos/${photo.id}`)
      .set("Cookie", staff.cookie)
      .expect(403);
    await t.http().get(`/venues/${venueId}/photos`).set("Cookie", outsider.cookie).expect(404);
    await t
      .http()
      .post(`/venues/${venueId}/photos/uploads`)
      .set("Cookie", outsider.cookie)
      .send(JPEG)
      .expect(404);
    await t.http().get(`/venues/${venueId}/photos`).expect(401);
  });

  it("stops at 20 photos per venue", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      venue_id: otherVenueId,
      object_key: `venues/${otherVenueId}/00000000-0000-4000-8000-${String(i).padStart(12, "0")}.jpg`,
      position: i,
    }));
    await t.db.insertInto("venue_photo").values(rows).execute();
    const res = await t
      .http()
      .post(`/venues/${otherVenueId}/photos/uploads`)
      .set("Cookie", owner.cookie)
      .send(JPEG)
      .expect(409);
    expect(res.body.message).toBe("A venue can have at most 20 photos");
  });
});

describe("DisabledPhotoStorage", () => {
  it("answers 503 when R2 is not configured", () => {
    expect(() => new DisabledPhotoStorage().presignUpload()).toThrow(ServiceUnavailableException);
  });
});
