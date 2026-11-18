import 'server-only';
import { cache } from 'react';
import { profileControllerGetMine } from '@/api/generated';
import { query } from '../query';

/** The caller's own account and profile. Deduplicated per request (the user menu reads it too). */
export const getMyProfile = cache(() => query(profileControllerGetMine()));
