import { describe, expect, it } from 'vitest';
import {
  canAddUpload,
  canChangeUpload,
  canSeeUpload,
  fileError,
  fitsInStorage,
  MAX_UPLOAD_BYTES,
  opensInline,
  ORGANIZATION_STORAGE_LIMIT_BYTES,
  type UploadOwner,
} from './upload-rules.js';

const pdf = { name: 'offerte.pdf', mimeType: 'application/pdf', sizeBytes: 1000 };

describe('fileError', () => {
  it('accepts allowed types with a matching extension', () => {
    expect(fileError(pdf)).toBeNull();
    expect(fileError({ ...pdf, name: 'Grondplan.JPEG', mimeType: 'image/jpeg' })).toBeNull();
    expect(
      fileError({
        ...pdf,
        name: 'budget.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ).toBeNull();
  });

  it('refuses types that can run scripts, and unknown types', () => {
    expect(fileError({ ...pdf, name: 'logo.svg', mimeType: 'image/svg+xml' })).toMatch(/mimeType/);
    expect(fileError({ ...pdf, name: 'x.html', mimeType: 'text/html' })).toMatch(/mimeType/);
    expect(fileError({ ...pdf, name: 'x.exe', mimeType: 'application/octet-stream' })).toMatch(
      /mimeType/,
    );
  });

  it('refuses a name whose extension does not match the type', () => {
    expect(fileError({ ...pdf, name: 'offerte.html' })).toMatch(/extension/);
    expect(fileError({ ...pdf, name: 'offerte' })).toMatch(/extension/);
  });

  it('refuses empty and too large files', () => {
    expect(fileError({ ...pdf, sizeBytes: 0 })).toMatch(/empty/);
    expect(fileError({ ...pdf, sizeBytes: MAX_UPLOAD_BYTES })).toBeNull();
    expect(fileError({ ...pdf, sizeBytes: MAX_UPLOAD_BYTES + 1 })).toMatch(/25 MB/);
  });
});

describe('fitsInStorage', () => {
  it('allows filling the organization up to the limit, not beyond', () => {
    expect(fitsInStorage(ORGANIZATION_STORAGE_LIMIT_BYTES - 10, 10)).toBe(true);
    expect(fitsInStorage(ORGANIZATION_STORAGE_LIMIT_BYTES - 10, 11)).toBe(false);
  });
});

describe('opensInline', () => {
  it('opens images and PDFs, downloads the rest', () => {
    expect(opensInline('application/pdf')).toBe(true);
    expect(opensInline('image/png')).toBe(true);
    expect(opensInline('text/csv')).toBe(false);
  });
});

describe('permissions', () => {
  const manager = { userId: 'manager', canManage: true };
  const mo = { userId: 'mo', canManage: false };
  const event: UploadOwner = { type: 'event' };
  const mine: UploadOwner = { type: 'task', task: { assigneeUserId: 'mo', assigneeName: null } };
  const unassigned: UploadOwner = {
    type: 'task',
    task: { assigneeUserId: null, assigneeName: null },
  };
  const someoneElses: UploadOwner = {
    type: 'task',
    task: { assigneeUserId: 'zoe', assigneeName: null },
  };

  it('shows event files to everyone, task files to who sees the task', () => {
    expect(canSeeUpload(mo, event)).toBe(true);
    expect(canSeeUpload(mo, mine)).toBe(true);
    expect(canSeeUpload(mo, unassigned)).toBe(true);
    expect(canSeeUpload(mo, someoneElses)).toBe(false);
    expect(canSeeUpload(manager, someoneElses)).toBe(true);
  });

  it('lets managers add anywhere, members only to their own task', () => {
    expect(canAddUpload(manager, event)).toBe(true);
    expect(canAddUpload(mo, event)).toBe(false);
    expect(canAddUpload(mo, mine)).toBe(true);
    expect(canAddUpload(mo, unassigned)).toBe(false);
  });

  it('lets managers change any file, members only their own task files', () => {
    expect(canChangeUpload(manager, event, { uploadedByUserId: 'x' })).toBe(true);
    expect(canChangeUpload(mo, event, { uploadedByUserId: 'mo' })).toBe(false);
    expect(canChangeUpload(mo, mine, { uploadedByUserId: 'mo' })).toBe(true);
    expect(canChangeUpload(mo, mine, { uploadedByUserId: 'manager' })).toBe(false);
    // A task taken off them hides it, and their files with it.
    expect(canChangeUpload(mo, someoneElses, { uploadedByUserId: 'mo' })).toBe(false);
  });
});
