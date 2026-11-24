import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { recordActivity, type ActivityScope } from '../../activity/activity-log.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database, Transaction } from '../../db/database.js';
import type { EventRow, UploadRow } from '../../db/schema/index.js';
import { FileStorage } from '../../storage/file-storage.js';
import { isReadOnly } from '../events/event-status.js';
import type { TaskViewer } from '../tasks/task-rules.js';
import {
  canAddUpload,
  canChangeUpload,
  canSeeUpload,
  fileError,
  fitsInStorage,
  opensInline,
  ORGANIZATION_STORAGE_LIMIT_BYTES,
  SIGNED_URL_SECONDS,
  storageKeyFor,
  type UploadOwner,
} from './upload-rules.js';
import { UploadsRepository, type UploadView } from './uploads.repository.js';
import type {
  CreateUploadInput,
  DownloadUrlDto,
  PendingUploadDto,
  RenameUploadInput,
  UploadDto,
  UploadListDto,
} from './uploads.schemas.js';

/** The file name is free text: name only. Type and size say what kind of file it was. */
const UPLOAD_LOGGED_VALUES = ['mimeType', 'sizeBytes', 'status', 'uploadedByUserId'] as const;

/**
 * Files attached to an event or one of its tasks. The browser uploads straight to storage:
 * `create` announces the file and returns a signed upload URL, `confirm` checks what arrived and
 * lists it. Only confirmed files are logged and shown.
 *
 * Routes have only checked 'read' on the event; the rules in upload-rules.ts decide the rest.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly uploads: UploadsRepository,
    private readonly storage: FileStorage,
  ) {}

  async list(org: OrgContext, access: EventAccess, taskId?: string): Promise<UploadListDto> {
    const viewer = viewerOf(org, access);
    if (taskId) await this.findTaskOwner(viewer, access.event.id, taskId);
    const views = await this.uploads.listViews(org.organizationId, access.event.id, {
      taskId,
      readyOnly: true,
    });
    return {
      uploads: views
        .filter((view) => canSeeUpload(viewer, ownerOf(view)))
        .map((view) => toUploadDto(viewer, view)),
      storage: {
        usedBytes: await this.uploads.usedBytes(this.db, org.organizationId),
        limitBytes: ORGANIZATION_STORAGE_LIMIT_BYTES,
      },
      enabled: this.storage.enabled,
      canAddToEvent: canAddUpload(viewer, { type: 'event' }),
    };
  }

  /** Checks the file and reserves its space, then signs the URL the browser uploads it to. */
  async create(
    org: OrgContext,
    access: EventAccess,
    input: CreateUploadInput,
  ): Promise<PendingUploadDto> {
    const viewer = viewerOf(org, access);
    assertWritable(access.event);
    this.assertEnabled();
    const error = fileError(input);
    if (error) throw new BadRequestException(error);

    const owner: UploadOwner = input.taskId
      ? await this.findTaskOwner(viewer, access.event.id, input.taskId)
      : { type: 'event' };
    if (!canAddUpload(viewer, owner)) throw new ForbiddenException();

    const id = randomUUID();
    const row = await this.db.transaction(async (tx) => {
      await this.uploads.lockOrganization(tx, org.organizationId);
      const used = await this.uploads.usedBytes(tx, org.organizationId);
      if (!fitsInStorage(used, input.sizeBytes)) {
        throw new ConflictException('The organization has no storage left for this file');
      }
      return this.uploads.insert(
        tx,
        {
          id,
          organizationId: org.organizationId,
          storageKey: storageKeyFor(org.organizationId, id),
          name: input.name,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          uploadedByUserId: org.userId,
        },
        input.taskId ? { taskId: input.taskId } : { eventId: access.event.id },
      );
    });

    const uploadUrl = await this.storage.createUploadUrl({
      key: row.storageKey,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      expiresInSeconds: SIGNED_URL_SECONDS,
    });
    return {
      id: row.id,
      uploadUrl,
      headers: { 'Content-Type': row.mimeType },
      expiresAt: expiresAt().toISOString(),
    };
  }

  /**
   * Lists the file once storage holds exactly what was announced. A file that differs is deleted
   * on the spot. Confirming twice is fine.
   */
  async confirm(org: OrgContext, access: EventAccess, uploadId: string): Promise<UploadDto> {
    const viewer = viewerOf(org, access);
    assertWritable(access.event);
    this.assertEnabled();
    const view = await this.findVisible(org, access, uploadId, { readyOnly: false });
    const current = view.upload;
    // Only whoever announced the file confirms it.
    if (current.uploadedByUserId !== org.userId) throw new NotFoundException('File not found');
    if (current.status === 'ready') return toUploadDto(viewer, view);

    const stored = await this.storage.stat(current.storageKey);
    if (!stored) throw new ConflictException('The file has not been uploaded yet');
    if (stored.sizeBytes !== current.sizeBytes || stored.mimeType !== current.mimeType) {
      await this.discard(current);
      throw new BadRequestException('The uploaded file does not match what was announced');
    }

    const row = await this.db.transaction(async (tx) => {
      const ready = await this.uploads.update(tx, uploadId, { status: 'ready' });
      await recordActivity(tx, org, {
        action: 'created',
        entityType: 'upload',
        entity: ready,
        before: null,
        eventId: access.event.id,
        values: UPLOAD_LOGGED_VALUES,
      });
      return ready;
    });
    return toUploadDto(viewer, { ...view, upload: row });
  }

  async rename(
    org: OrgContext,
    access: EventAccess,
    uploadId: string,
    input: RenameUploadInput,
  ): Promise<UploadDto> {
    const viewer = viewerOf(org, access);
    assertWritable(access.event);
    const view = await this.findChangeable(org, access, uploadId);
    const current = view.upload;
    const error = fileError({ ...current, name: input.name });
    if (error) throw new BadRequestException(error);
    if (input.name === current.name) return toUploadDto(viewer, view);

    const row = await this.db.transaction(async (tx) => {
      const renamed = await this.uploads.update(tx, uploadId, { name: input.name });
      await recordActivity(tx, org, {
        action: 'renamed',
        entityType: 'upload',
        entity: renamed,
        before: current,
        eventId: access.event.id,
        values: UPLOAD_LOGGED_VALUES,
      });
      return renamed;
    });
    return toUploadDto(viewer, { ...view, upload: row });
  }

  /** Soft-deletes the file; the cleanup job removes it from storage after the retention period. */
  async remove(org: OrgContext, access: EventAccess, uploadId: string): Promise<void> {
    assertWritable(access.event);
    await this.findChangeable(org, access, uploadId);
    await this.db.transaction(async (tx) => {
      const row = await this.uploads.update(tx, uploadId, { deletedAt: new Date() });
      await recordActivity(tx, org, {
        action: 'deleted',
        entityType: 'upload',
        entity: row,
        eventId: access.event.id,
      });
    });
  }

  /** Works on archived events too: they are read-only, not hidden. */
  async downloadUrl(
    org: OrgContext,
    access: EventAccess,
    uploadId: string,
  ): Promise<DownloadUrlDto> {
    this.assertEnabled();
    const { upload } = await this.findVisible(org, access, uploadId, { readyOnly: true });
    const url = await this.storage.createDownloadUrl({
      key: upload.storageKey,
      fileName: upload.name,
      mimeType: upload.mimeType,
      inline: opensInline(upload.mimeType),
      expiresInSeconds: SIGNED_URL_SECONDS,
    });
    return { url, expiresAt: expiresAt().toISOString() };
  }

  /**
   * Deletes a task's files with the task, in the task's transaction. Only listed (ready) files
   * were logged as created, so only they are logged as deleted.
   */
  async removeForTask(
    tx: Transaction,
    scope: ActivityScope,
    eventId: string,
    taskId: string,
  ): Promise<void> {
    for (const row of await this.uploads.deleteForTask(tx, taskId, new Date())) {
      if (row.status !== 'ready') continue;
      await recordActivity(tx, scope, {
        action: 'deleted',
        entityType: 'upload',
        entity: row,
        eventId,
      });
    }
  }

  private assertEnabled(): void {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException('File uploads are not available');
    }
  }

  /** The task as owner, if the caller may see it; 404 otherwise, like the tasks routes. */
  private async findTaskOwner(
    viewer: TaskViewer,
    eventId: string,
    taskId: string,
  ): Promise<UploadOwner> {
    const found = await this.uploads.findTask(eventId, taskId);
    const owner: UploadOwner | null = found ? { type: 'task', task: found } : null;
    if (!owner || !canSeeUpload(viewer, owner)) throw new NotFoundException('Task not found');
    return owner;
  }

  /** The file, if the caller may see it; 404 otherwise, so hidden files don't leak. */
  private async findVisible(
    org: OrgContext,
    access: EventAccess,
    uploadId: string,
    { readyOnly }: { readyOnly: boolean },
  ): Promise<UploadView> {
    const [view] = await this.uploads.listViews(org.organizationId, access.event.id, {
      uploadId,
      readyOnly,
    });
    if (!view || !canSeeUpload(viewerOf(org, access), ownerOf(view))) {
      throw new NotFoundException('File not found');
    }
    return view;
  }

  private async findChangeable(
    org: OrgContext,
    access: EventAccess,
    uploadId: string,
  ): Promise<UploadView> {
    const view = await this.findVisible(org, access, uploadId, { readyOnly: true });
    if (!canChangeUpload(viewerOf(org, access), ownerOf(view), view.upload)) {
      throw new ForbiddenException();
    }
    return view;
  }

  /** Throws away a file that didn't match: soft-deleted, and removed from storage right away. */
  private async discard(row: UploadRow): Promise<void> {
    const now = new Date();
    await this.uploads.update(this.db, row.id, { deletedAt: now });
    try {
      await this.storage.delete(row.storageKey);
      await this.uploads.update(this.db, row.id, { purgedAt: now });
    } catch (error) {
      // The cleanup job tries again: deleted pending files are purged on its next run.
      this.logger.warn(`Could not remove rejected upload ${row.id}: ${String(error)}`);
    }
  }
}

const viewerOf = (org: OrgContext, access: EventAccess): TaskViewer => ({
  userId: org.userId,
  canManage: access.canManage,
});

const ownerOf = (view: UploadView): UploadOwner =>
  view.task ? { type: 'task', task: view.task } : { type: 'event' };

const expiresAt = () => new Date(Date.now() + SIGNED_URL_SECONDS * 1000);

/** Archived events are read-only, their files included. */
function assertWritable(event: EventRow): void {
  if (isReadOnly(event.status)) {
    throw new ConflictException('An archived event cannot be changed');
  }
}

function toUploadDto(viewer: TaskViewer, view: UploadView): UploadDto {
  const { upload } = view;
  return {
    id: upload.id,
    name: upload.name,
    mimeType: upload.mimeType,
    sizeBytes: upload.sizeBytes,
    createdAt: upload.createdAt.toISOString(),
    uploadedBy: { userId: upload.uploadedByUserId, name: view.uploaderName },
    task: view.task ? { id: view.task.id, title: view.task.title } : null,
    canChange: canChangeUpload(viewer, ownerOf(view), upload),
  };
}
