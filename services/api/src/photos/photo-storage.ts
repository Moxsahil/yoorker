import { ServiceUnavailableException } from "@nestjs/common";

export interface StoredObject {
  size: number;
  contentType: string | undefined;
}

export interface PresignedUpload {
  url: string;
  /** Headers the browser must send with the PUT; they are part of the signature. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface PhotoStorage {
  presignUpload(key: string, contentType: string, size: number): Promise<PresignedUpload>;
  head(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export const PHOTO_STORAGE = Symbol("PHOTO_STORAGE");

export class DisabledPhotoStorage implements PhotoStorage {
  private fail(): never {
    throw new ServiceUnavailableException("Photo uploads aren't set up on this server");
  }
  presignUpload(): never {
    return this.fail();
  }
  head(): never {
    return this.fail();
  }
  delete(): never {
    return this.fail();
  }
  publicUrl(): never {
    return this.fail();
  }
}
