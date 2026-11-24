import {
  FileStorage,
  type DownloadUrlRequest,
  type StoredObject,
  type UploadUrlRequest,
} from '../src/storage/file-storage.js';

/**
 * File storage in memory. Tests play the browser with `put` (the upload to the signed URL) and
 * read back what was signed through `uploads` and `downloads`.
 */
export class FakeFileStorage extends FileStorage {
  enabled = true;
  readonly objects = new Map<string, StoredObject>();
  readonly uploads: UploadUrlRequest[] = [];
  readonly downloads: DownloadUrlRequest[] = [];
  readonly deleted: string[] = [];

  createUploadUrl(request: UploadUrlRequest): Promise<string> {
    this.uploads.push(request);
    return Promise.resolve(`https://storage.test/upload/${request.key}`);
  }

  createDownloadUrl(request: DownloadUrlRequest): Promise<string> {
    this.downloads.push(request);
    return Promise.resolve(`https://storage.test/download/${request.key}`);
  }

  stat(key: string): Promise<StoredObject | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    this.deleted.push(key);
    return Promise.resolve();
  }

  /** The browser's upload: by default exactly what the last upload URL was signed for. */
  put(key: string, object?: Partial<StoredObject>): void {
    const signed = this.uploads.findLast((upload) => upload.key === key);
    this.objects.set(key, {
      sizeBytes: object?.sizeBytes ?? signed?.sizeBytes ?? 0,
      mimeType: object?.mimeType ?? signed?.mimeType ?? null,
    });
  }

  reset(): void {
    this.enabled = true;
    this.objects.clear();
    this.uploads.length = 0;
    this.downloads.length = 0;
    this.deleted.length = 0;
  }
}
