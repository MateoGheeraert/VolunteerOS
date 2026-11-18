import { Body, Controller, Delete, Get, HttpCode } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/auth.decorators.js';
import type { AuthUser } from '../../auth/auth.js';
import {
  deleteAccountSchema,
  deletionCheckSchema,
  type DeleteAccountInput,
} from './account.schemas.js';
import { AccountService } from './account.service.js';

/** Deleting your own account. Not organization-scoped: the account spans every organization. */
@ApiTags('account')
@Controller('me')
export class AccountController {
  constructor(private readonly accounts: AccountService) {}

  /** What deleting the account would do now: what blocks it, and which organizations go with it. */
  @Get('deletion-check')
  @ApiResponse({ status: 200, standardSchema: deletionCheckSchema })
  check(@CurrentUser() user: AuthUser) {
    return this.accounts.check(user.id);
  }

  /**
   * Deletes (anonymizes) the account, effective immediately; every session ends. 400 with a wrong
   * password, 409 while the caller is the only owner of an organization with other members.
   */
  @Delete()
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Body({ schema: deleteAccountSchema }) body: DeleteAccountInput,
  ) {
    return this.accounts.delete(user.id, body);
  }
}
