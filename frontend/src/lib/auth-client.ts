'use client';

import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/** Talks to /api/auth/* on this origin, which the route handler forwards to Nest. */
export const authClient = createAuthClient({ plugins: [organizationClient()] });
