import 'server-only';
import { accountControllerCheck } from '@/api/generated';
import { query } from '../query';

/** What deleting the caller's account would do now: blockers and organizations that go with it. */
export const getDeletionCheck = () => query(accountControllerCheck());
