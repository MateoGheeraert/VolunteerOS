import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/auth.decorators.js';
import type { AuthUser } from '../../auth/auth.js';
import {
  myProfileSchema,
  updateProfileSchema,
  userProfileSchema,
  type UpdateProfileInput,
} from './profile.schemas.js';
import { ProfileService } from './profile.service.js';

/**
 * Personal profiles. Not organization-scoped: a profile belongs to the user, across every
 * organization they are in. Email and password changes go through Better Auth (/api/auth).
 */
@ApiTags('profile')
@Controller()
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get('me/profile')
  @ApiResponse({ status: 200, standardSchema: myProfileSchema })
  getMine(@CurrentUser() user: AuthUser) {
    return this.profiles.getMine(user.id);
  }

  /** Changes the name and profile fields that are sent; null clears a field. */
  @Patch('me/profile')
  @ApiResponse({ status: 200, standardSchema: myProfileSchema })
  update(
    @CurrentUser() user: AuthUser,
    @Body({ schema: updateProfileSchema }) body: UpdateProfileInput,
  ) {
    return this.profiles.update(user.id, body);
  }

  /** Another user's profile, as far as the caller may see it; 404 without a shared organization. */
  @Get('users/:userId/profile')
  @ApiResponse({ status: 200, standardSchema: userProfileSchema })
  getUser(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.profiles.getUser(user.id, userId);
  }
}
