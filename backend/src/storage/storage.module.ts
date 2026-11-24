import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { DisabledFileStorage, FileStorage, S3FileStorage } from './file-storage.js';

export function createFileStorage(
  env: Pick<Env, 'R2_ACCOUNT_ID' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY' | 'R2_BUCKET'>,
): FileStorage {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    return new DisabledFileStorage();
  }
  return new S3FileStorage({
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
  });
}

/** Object storage for uploaded files. Global: features that own files inject `FileStorage`. */
@Global()
@Module({
  providers: [{ provide: FileStorage, inject: [ENV], useFactory: createFileStorage }],
  exports: [FileStorage],
})
export class StorageModule {}
