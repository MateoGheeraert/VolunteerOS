import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { FileStorage } from '../../storage/file-storage.js';
import { JobsService } from '../../jobs/jobs.service.js';
import { DELETED_UPLOAD_RETENTION_MS, PENDING_UPLOAD_TTL_MS } from './upload-rules.js';
import { UploadsRepository } from './uploads.repository.js';

/** Every night at 03:30, Brussels time. */
const CLEANUP_CRON = '30 3 * * *';
/** Objects removed per batch; a run keeps going until nothing is left. */
const BATCH_SIZE = 200;

/**
 * The daily cleanup of file storage. Rows are never removed; this job removes the objects:
 * - uploads never confirmed within a day are marked deleted, and their objects removed;
 * - files deleted more than 30 days ago have their objects removed.
 * Each removed object sets `purged_at`, so running it twice does nothing the second time. Purges
 * aren't logged: the deletion itself already was.
 */
@Injectable()
export class UploadsCleanupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UploadsCleanupService.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly uploads: UploadsRepository,
    private readonly storage: FileStorage,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.jobs.work('uploadCleanup', async () => {
      await this.run();
    });
    await this.jobs.schedule('uploadCleanup', CLEANUP_CRON, {});
  }

  /** Public so tests can run it with a chosen "now". Returns how many objects it removed. */
  async run(now = new Date()): Promise<number> {
    // Without storage there are no objects to remove; rows wait for storage to come back.
    if (!this.storage.enabled) return 0;
    const abandoned = await this.uploads.deleteAbandoned(
      new Date(now.getTime() - PENDING_UPLOAD_TTL_MS),
      now,
    );
    const deletedBefore = new Date(now.getTime() - DELETED_UPLOAD_RETENTION_MS);
    let purged = 0;
    for (;;) {
      const batch = await this.uploads.listPurgeable(deletedBefore, BATCH_SIZE);
      for (const row of batch) {
        await this.storage.delete(row.storageKey);
        await this.uploads.markPurged(row.id, now);
      }
      purged += batch.length;
      if (batch.length < BATCH_SIZE) break;
    }
    if (abandoned > 0 || purged > 0) {
      this.logger.log(`Upload cleanup: ${abandoned} abandoned, ${purged} removed from storage`);
    }
    return purged;
  }
}
