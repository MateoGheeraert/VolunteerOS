import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** What the stored object turned out to be. */
export interface StoredObject {
  sizeBytes: number;
  mimeType: string | null;
}

export interface UploadUrlRequest {
  key: string;
  mimeType: string;
  sizeBytes: number;
  expiresInSeconds: number;
}

export interface DownloadUrlRequest {
  key: string;
  fileName: string;
  mimeType: string;
  /** Open in the browser (images, PDF) instead of saving. */
  inline: boolean;
  expiresInSeconds: number;
}

/** File storage is off: the R2 environment variables are not set. */
export class FileStorageUnavailableError extends Error {
  constructor() {
    super('File storage is off: the R2_* environment variables are not set');
    this.name = 'FileStorageUnavailableError';
  }
}

/**
 * Where uploaded files live. Browsers never send files through Nest: they get a short-lived
 * signed URL and talk to the storage directly. Chosen by the R2_* variables (see storage.module).
 */
export abstract class FileStorage {
  /** False when storage isn't configured; every other method then throws. */
  abstract readonly enabled: boolean;
  /** A URL the browser PUTs the file to. Size and type are signed: anything else is refused. */
  abstract createUploadUrl(request: UploadUrlRequest): Promise<string>;
  /** A URL that serves the file under its original name. */
  abstract createDownloadUrl(request: DownloadUrlRequest): Promise<string>;
  /** The object as stored, or null when nothing was uploaded under the key. */
  abstract stat(key: string): Promise<StoredObject | null>;
  /** Removes the object; removing a missing one is fine. */
  abstract delete(key: string): Promise<void>;
}

/** Storage when the R2 variables are not set. */
export class DisabledFileStorage extends FileStorage {
  readonly enabled = false;
  createUploadUrl(): Promise<string> {
    throw new FileStorageUnavailableError();
  }
  createDownloadUrl(): Promise<string> {
    throw new FileStorageUnavailableError();
  }
  stat(): Promise<StoredObject | null> {
    throw new FileStorageUnavailableError();
  }
  delete(): Promise<void> {
    throw new FileStorageUnavailableError();
  }
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** Cloudflare R2 through its S3 API: nothing here is R2-specific beyond the endpoint. */
export class S3FileStorage extends FileStorage {
  readonly enabled = true;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2Config) {
    super();
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // R2 doesn't support the CRC checksums newer SDKs add by default; a presigned PUT carrying
      // them would fail the browser's upload.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  createUploadUrl({ key, mimeType, sizeBytes, expiresInSeconds }: UploadUrlRequest) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
      ContentLength: sizeBytes,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
      // Sign these, so the upload must carry exactly the announced type and size.
      signableHeaders: new Set(['content-type', 'content-length']),
    });
  }

  createDownloadUrl({ key, fileName, mimeType, inline, expiresInSeconds }: DownloadUrlRequest) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: mimeType,
      ResponseContentDisposition: contentDisposition(fileName, inline),
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async stat(key: string): Promise<StoredObject | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: head.ContentLength ?? 0, mimeType: head.ContentType ?? null };
    } catch (error) {
      if (error instanceof NotFound) return null;
      if (isStatus(error, 404)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

const isStatus = (error: unknown, status: number) =>
  typeof error === 'object' &&
  error !== null &&
  '$metadata' in error &&
  (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === status;

/**
 * `inline` or `attachment`, with the file name both as ASCII fallback and RFC 5987 UTF-8, so
 * names like "offerte café.pdf" survive.
 */
export function contentDisposition(fileName: string, inline: boolean): string {
  const type = inline ? 'inline' : 'attachment';
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
