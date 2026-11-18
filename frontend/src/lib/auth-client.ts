'use client';

import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { ORGANIZATION_CATEGORIES } from '@/features/organizations/profile';

/** Talks to /api/auth/* on this origin, which the route handler forwards to Nest. */
export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      // Only what the browser sends: creating an organization needs its category. The rest of
      // the profile is edited through server actions (src/server/organizations).
      schema: {
        organization: {
          additionalFields: {
            category: { type: [...ORGANIZATION_CATEGORIES], required: true },
          },
        },
      },
    }),
  ],
});
