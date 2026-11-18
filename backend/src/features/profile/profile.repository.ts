import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { toOrgRole, type OrgRole } from '../../authz/policies.js';
import type { Database, DbExecutor } from '../../db/database.js';
import { member, user, userProfile, type UserProfileRow } from '../../db/schema/index.js';

/** The profile columns a user edits. */
export type ProfileValues = Omit<UserProfileRow, 'userId' | 'createdAt' | 'updatedAt'>;

export const EMPTY_PROFILE: ProfileValues = {
  phone: null,
  street: null,
  houseNumber: null,
  box: null,
  postalCode: null,
  city: null,
  country: null,
  birthDate: null,
};

/** A user with their profile (empty when they never saved one). */
export interface AccountView {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  profile: ProfileValues;
}

const PROFILE_COLUMNS = {
  phone: userProfile.phone,
  street: userProfile.street,
  houseNumber: userProfile.houseNumber,
  box: userProfile.box,
  postalCode: userProfile.postalCode,
  city: userProfile.city,
  country: userProfile.country,
  birthDate: userProfile.birthDate,
} satisfies Record<keyof ProfileValues, unknown>;

const callerMember = alias(member, 'caller_member');

/** Data access for users' personal profiles. */
@Injectable()
export class ProfileRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async findAccount(userId: string, db: DbExecutor = this.db): Promise<AccountView | null> {
    const [row] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        profile: PROFILE_COLUMNS,
      })
      .from(user)
      .leftJoin(userProfile, eq(userProfile.userId, user.id))
      .where(eq(user.id, userId));
    if (!row) return null;
    // Drizzle gives null for a joined object whose fields are all null: no (or an empty) profile.
    return { ...row, profile: row.profile ?? EMPTY_PROFILE };
  }

  /** The caller's roles in every organization they share with the other user. */
  async sharedOrganizationRoles(callerId: string, otherUserId: string): Promise<OrgRole[]> {
    const rows = await this.db
      .select({ role: callerMember.role })
      .from(callerMember)
      .innerJoin(member, eq(member.organizationId, callerMember.organizationId))
      .where(and(eq(callerMember.userId, callerId), eq(member.userId, otherUserId)));
    return rows.map((row) => toOrgRole(row.role));
  }

  async updateName(tx: DbExecutor, userId: string, name: string): Promise<void> {
    await tx.update(user).set({ name }).where(eq(user.id, userId));
  }

  /** Creates the profile on the first save, updates it after that. */
  async saveProfile(tx: DbExecutor, userId: string, values: ProfileValues): Promise<void> {
    await tx
      .insert(userProfile)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: userProfile.userId, set: values });
  }
}
