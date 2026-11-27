import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentEventAccess, OrgScoped, RequireEventAccess } from '../../authz/authz.decorators.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import { CurrentOrg, type OrgContext } from '../../authz/org-context.js';
import { aiRunSchema } from '../ai.schemas.js';
import { RuleDraftsService } from '../rule-drafts/rule-drafts.service.js';
import {
  requestShiftSuggestionsSchema,
  type RequestShiftSuggestionsInput,
  acceptPlacementsResultSchema,
  acceptRuleSuggestionSchema,
  acceptShiftChangeSchema,
  acceptTeamSuggestionsSchema,
  createRulesFromDraftSchema,
  draftRulesSchema,
  placementsSchema,
  ruleDraftResultSchema,
  type AcceptRuleSuggestionInput,
  type AcceptShiftChangeInput,
  type AcceptTeamSuggestionsInput,
  type CreateRulesFromDraftInput,
  type DraftRulesInput,
  type PlacementsInput,
} from './planning-ai.schemas.js';
import { PlanningSuggestionsService } from './planning-suggestions.service.js';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/**
 * Mila on the planning page (docs/info.md §7.7.1): asking for teams and shifts or an allocation,
 * turning the organizer's words into rules, and taking over her cards. The event's state and
 * stream, and rejecting a card, are the shared routes under /ai.
 */
@ApiTags('ai')
@OrgScoped()
@Controller('events/:eventId/ai/planning')
export class PlanningAiController {
  constructor(
    private readonly suggestions: PlanningSuggestionsService,
    private readonly drafts: RuleDraftsService,
  ) {}

  /** "Stel teams en shiften voor": the result arrives on the stream. */
  @Post('shift-suggestions')
  @HttpCode(202)
  @RequireEventAccess('manage')
  @ApiResponse({ status: 202, standardSchema: aiRunSchema })
  requestShiftSuggestions(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: requestShiftSuggestionsSchema }) body: RequestShiftSuggestionsInput,
  ) {
    return this.suggestions.request(org, access, 'shift_suggestions', body.instruction);
  }

  /** "Laat Mila verdelen": the proposal arrives on the stream. */
  @Post('allocation')
  @HttpCode(202)
  @RequireEventAccess('manage')
  @ApiResponse({ status: 202, standardSchema: aiRunSchema })
  requestAllocation(@CurrentOrg() org: OrgContext, @CurrentEventAccess() access: EventAccess) {
    return this.suggestions.request(org, access, 'allocation');
  }

  /** "Vertel Mila iets over de planning": rule chips to check; nothing is saved yet. */
  @Post('rule-drafts')
  @HttpCode(200)
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: ruleDraftResultSchema })
  draftRules(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: draftRulesSchema }) body: DraftRulesInput,
  ) {
    return this.drafts.draft(org, access, body.text);
  }

  /** Saves the rule chips the organizer kept. */
  @Post('rule-drafts/:runId/rules')
  @HttpCode(204)
  @RequireEventAccess('manage')
  createDraftRules(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('runId', uuid) runId: string,
    @Body({ schema: createRulesFromDraftSchema }) body: CreateRulesFromDraftInput,
  ) {
    return this.drafts.create(org, access, runId, body);
  }

  @Post('suggestions/accept-teams')
  @HttpCode(204)
  @RequireEventAccess('manage')
  acceptTeams(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: acceptTeamSuggestionsSchema }) body: AcceptTeamSuggestionsInput,
  ) {
    return this.suggestions.acceptTeams(org, access, body);
  }

  @Post('suggestions/:suggestionId/accept-shift-change')
  @HttpCode(204)
  @RequireEventAccess('manage')
  acceptShiftChange(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('suggestionId', uuid) suggestionId: string,
    @Body({ schema: acceptShiftChangeSchema }) body: AcceptShiftChangeInput,
  ) {
    return this.suggestions.acceptShiftChange(org, access, suggestionId, body);
  }

  @Post('suggestions/:suggestionId/accept-rule')
  @HttpCode(204)
  @RequireEventAccess('manage')
  acceptRule(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('suggestionId', uuid) suggestionId: string,
    @Body({ schema: acceptRuleSuggestionSchema }) body: AcceptRuleSuggestionInput,
  ) {
    return this.suggestions.acceptRule(org, access, suggestionId, body);
  }

  /** Takes over placements of the proposal as proposed assignments. */
  @Post('suggestions/:suggestionId/accept-placements')
  @HttpCode(200)
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: acceptPlacementsResultSchema })
  acceptPlacements(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('suggestionId', uuid) suggestionId: string,
    @Body({ schema: placementsSchema }) body: PlacementsInput,
  ) {
    return this.suggestions.acceptPlacements(org, access, suggestionId, body);
  }

  @Post('suggestions/:suggestionId/discard-placements')
  @HttpCode(204)
  @RequireEventAccess('manage')
  discardPlacements(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('suggestionId', uuid) suggestionId: string,
    @Body({ schema: placementsSchema }) body: PlacementsInput,
  ) {
    return this.suggestions.discardPlacements(org, access, suggestionId, body);
  }
}
