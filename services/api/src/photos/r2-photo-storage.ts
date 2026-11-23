import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "../config/env";
import type { PhotoStorage, PresignedUpload, StoredObject } from "./photo-storage";

export const UPLOAD_TTL_SECONDS = 600;

type R2Config = NonNullable<Env["R2"]>;

export class R2PhotoStorage implements PhotoStorage {
  private readonly client: S3Client;

  constructor(private readonly config: R2Config) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // R2 does not support the SDK's default CRC32 checksums on presigned uploads.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  async presignUpload(key: string, contentType: string, size: number): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
      // Photo files never change: a new photo gets a new key.
      CacheControl: "public, max-age=31536000, immutable",
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: UPLOAD_TTL_SECONDS,
      // Signed, so R2 rejects a PUT with another type or size than the one approved.
      signableHeaders: new Set(["content-type", "content-length", "cache-control"]),
    });
    return {
      url,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000),
    };
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const object = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return { size: object.ContentLength ?? 0, contentType: object.ContentType };
    } catch (err) {
      if (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  publicUrl(key: string): string {
    return `${this.config.publicUrl}/${key}`;
  }
}
