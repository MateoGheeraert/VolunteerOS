import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { accountScope, recordActivity } from '../../activity/activity-log.js';
import { profileVisibility } from '../../authz/policies.js';
import type { Database } from '../../db/database.js';
import { ProfileRepository, type AccountView, type ProfileValues } from './profile.repository.js';
import type { MyProfileDto, UpdateProfileInput, UserProfileDto } from './profile.schemas.js';

/**
 * A user's own name and personal profile, and what others may see of it.
 *
 * Every change is logged as an account-level entry (no organization, entity `user`), in the same
 * transaction. All of it is personal data, so the log holds field names only.
 */
@Injectable()
export class ProfileService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly profiles: ProfileRepository,
  ) {}

  async getMine(userId: string): Promise<MyProfileDto> {
    const account = await this.profiles.findAccount(userId);
    // The session guard just found this user, so it exists unless it was deleted meanwhile.
    if (!account) throw new NotFoundException();
    return toMyProfileDto(account);
  }

  async update(userId: string, input: UpdateProfileInput): Promise<MyProfileDto> {
    const updated = await this.db.transaction(async (tx) => {
      const current = await this.profiles.findAccount(userId, tx);
      if (!current) throw new NotFoundException();

      const profile = { ...current.profile, ...toProfileValues(input) };
      if (input.name !== undefined && input.name !== current.name) {
        await this.profiles.updateName(tx, userId, input.name);
      }
      if (hasProfileFields(input)) {
        await this.profiles.saveProfile(tx, userId, profile);
      }
      const after: AccountView = { ...current, name: input.name ?? current.name, profile };
      await recordActivity(tx, accountScope(userId), {
        action: 'updated',
        entityType: 'user',
        entity: loggedAccount(after),
        before: loggedAccount(current),
      });
      return after;
    });
    return toMyProfileDto(updated);
  }

  /** Another user's profile, limited to what the caller may see (see profileVisibility). */
  async getUser(callerId: string, userId: string): Promise<UserProfileDto> {
    // Yourself: everything.
    const visibility =
      callerId === userId
        ? { personal: true }
        : profileVisibility(await this.profiles.sharedOrganizationRoles(callerId, userId));
    const account = visibility && (await this.profiles.findAccount(userId));
    if (!visibility || !account) throw new NotFoundException();

    const { profile } = account;
    return {
      userId: account.id,
      name: account.name,
      phone: profile.phone,
      ...(visibility.personal && { address: toAddress(profile), birthDate: profile.birthDate }),
    };
  }
}

function hasProfileFields(input: UpdateProfileInput): boolean {
  return input.phone !== undefined || input.address !== undefined || input.birthDate !== undefined;
}

/** The profile columns an update sets; the address is replaced or cleared as a whole. */
function toProfileValues(input: UpdateProfileInput): Partial<ProfileValues> {
  const values: Partial<ProfileValues> = {};
  if (input.phone !== undefined) values.phone = input.phone;
  if (input.birthDate !== undefined) values.birthDate = input.birthDate;
  if (input.address !== undefined) {
    const address = input.address;
    values.street = address?.street ?? null;
    values.houseNumber = address?.houseNumber ?? null;
    values.box = address?.box ?? null;
    values.postalCode = address?.postalCode ?? null;
    values.city = address?.city ?? null;
    values.country = address?.country ?? null;
  }
  return values;
}

/** The account as the activity log diffs it: one flat record, logged by field name only. */
function loggedAccount(account: AccountView) {
  return { id: account.id, name: account.name, ...account.profile };
}

function toAddress(profile: ProfileValues): MyProfileDto['address'] {
  const { street, houseNumber, box, postalCode, city, country } = profile;
  if (!street || !houseNumber || !postalCode || !city || !country) return null;
  return { street, houseNumber, box, postalCode, city, country };
}

function toMyProfileDto(account: AccountView): MyProfileDto {
  return {
    userId: account.id,
    name: account.name,
    email: account.email,
    emailVerified: account.emailVerified,
    phone: account.profile.phone,
    address: toAddress(account.profile),
    birthDate: account.profile.birthDate,
  };
}
