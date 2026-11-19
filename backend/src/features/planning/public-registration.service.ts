import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { recordActivity, type ActivityScope } from '../../activity/activity-log.js';
import type { Database } from '../../db/database.js';
import type { EventRow } from '../../db/schema/index.js';
import { EmailService } from '../../email/email.service.js';
import { registrationClosedReason, requiredShiftCount } from './planning-rules.js';
import {
  APPLICATION_LOGGED_VALUES,
  assertKnownShifts,
  assertKnownTeam,
  isUniqueViolation,
} from './planning.mappers.js';
import { PlanningRepository } from './planning.repository.js';
import type { PublicEventDto, PublicRegistrationInput } from './planning.schemas.js';
import { RateLimiter } from './rate-limiter.js';

/** 5 sign-ups per 10 minutes per IP address and event: a family on one wifi, not a script. */
const limiter = new RateLimiter(5, 10 * 60 * 1000);

/**
 * The public registration page: no account, reached by the event's link. It shows the event and
 * its shifts, never anything about other volunteers, and turns a sign-up into a volunteer (per
 * organization) and an application (per event). Signing up again with the same email updates
 * the existing application; the acknowledgement email tells its owner either way.
 */
@Injectable()
export class PublicRegistrationService {
  private readonly logger = new Logger('PublicRegistration');

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly planning: PlanningRepository,
    private readonly email: EmailService,
  ) {}

  async get(slug: string): Promise<PublicEventDto> {
    const { event, organizationName } = await this.find(slug);
    const closedReason = registrationClosedReason(event, new Date());
    const [teams, shifts] = closedReason
      ? [[], []]
      : await Promise.all([this.planning.listTeams(event.id), this.planning.listShifts(event.id)]);
    return {
      name: event.name,
      description: event.description,
      location: event.location,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      organizationName,
      closedReason,
      registrationDeadline: event.registrationDeadline?.toISOString() ?? null,
      volunteerCommitment: event.volunteerCommitment,
      requiredShifts: requiredShiftCount(event.shiftsPerVolunteer, shifts.length),
      teams: teams
        .map((team) => ({
          id: team.id,
          name: team.name,
          description: team.description,
          shifts: shifts
            .filter((s) => s.teamId === team.id)
            .map((s) => ({
              id: s.id,
              startsAt: s.startsAt.toISOString(),
              endsAt: s.endsAt.toISOString(),
              meetingPoint: s.meetingPoint,
            })),
        }))
        .filter((team) => team.shifts.length > 0),
    };
  }

  async register(slug: string, input: PublicRegistrationInput, ip: string): Promise<void> {
    if (!limiter.take(`${ip}:${slug}`)) {
      throw new HttpException(
        'Too many registrations, try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const { event, organizationName } = await this.find(slug);
    if (registrationClosedReason(event, new Date())) {
      throw new ConflictException('Registration is closed');
    }
    // A bot filled in the hidden field: answer like a success, store nothing.
    if (input.website) return;

    const [teams, shifts] = await Promise.all([
      this.planning.listTeams(event.id),
      this.planning.listShifts(event.id),
    ]);
    assertKnownTeam(input.preferredTeamId, teams);
    const shiftIds = assertKnownShifts(input.availableShiftIds, shifts);
    if (event.volunteerCommitment === 'whole_event' && !input.wholeEvent) {
      throw new BadRequestException('wholeEvent: this event asks volunteers for the whole event');
    }
    const required = requiredShiftCount(event.shiftsPerVolunteer, shifts.length);
    if (!input.wholeEvent && shiftIds.length < required) {
      throw new BadRequestException(`availableShiftIds: pick at least ${required} shifts`);
    }

    // Two first sign-ups with the same email at once: the second loses the unique index, and
    // trying again finds the volunteer the first one created.
    const { applicationId, updated } = await this.save(event, input, shiftIds).catch(
      (error: unknown) => {
        if (isUniqueViolation(error, 'volunteer_organization_email_uidx')) {
          return this.save(event, input, shiftIds);
        }
        throw error;
      },
    );

    // The sign-up is stored; a failing email must not turn it into an error for the volunteer.
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    await this.email
      .send({
        template: 'volunteer-registration',
        to: input.email,
        // Every submit gets its own acknowledgement, so the owner of the address sees each change.
        idempotencyKey: `volunteer-registration:${applicationId}:${Date.now()}`,
        organizationId: event.organizationId,
        eventId: event.id,
        props: {
          volunteerName: input.name,
          eventName: event.name,
          organizationName,
          eventStartsAt: event.startsAt,
          updated,
          wholeEvent: input.wholeEvent,
          shifts: shifts
            .filter((s) => shiftIds.includes(s.id))
            .map((s) => ({
              teamName: teamName.get(s.teamId) ?? '',
              startsAt: s.startsAt,
              endsAt: s.endsAt,
            })),
          preferredTeamName: input.preferredTeamId
            ? (teamName.get(input.preferredTeamId) ?? null)
            : null,
        },
      })
      .catch((error: unknown) =>
        this.logger.warn(`Registration email for ${applicationId} failed: ${String(error)}`),
      );
  }

  private save(event: EventRow, input: PublicRegistrationInput, shiftIds: string[]) {
    return this.db.transaction(async (tx) => {
      const choices = {
        availableShiftIds: input.wholeEvent ? [] : shiftIds,
        wholeEvent: input.wholeEvent,
        preferredTeamId: input.preferredTeamId ?? null,
        notes: input.notes || null,
        consentedAt: new Date(),
      };
      const known = await this.planning.findVolunteerByEmail(tx, event.organizationId, input.email);
      const person =
        known ??
        (await this.planning.insertVolunteer(tx, {
          organizationId: event.organizationId,
          name: input.name,
          email: input.email,
          phone: input.phone || null,
        }));
      const scope: ActivityScope = {
        organizationId: event.organizationId,
        actor: { type: 'volunteer', id: person.id },
      };
      if (known) {
        const updatedPerson = await this.planning.updateVolunteer(tx, known.id, {
          name: input.name,
          ...(input.phone && { phone: input.phone }),
        });
        await recordActivity(tx, scope, {
          action: 'updated',
          entityType: 'volunteer',
          entity: updatedPerson,
          before: known,
          eventId: event.id,
        });
      } else {
        await recordActivity(tx, scope, {
          action: 'created',
          entityType: 'volunteer',
          entity: person,
          before: null,
          eventId: event.id,
        });
      }

      const existing = await this.planning.findApplicationOfVolunteer(tx, event.id, person.id);
      if (existing) {
        const row = await this.planning.updateApplication(tx, existing.id, choices);
        await recordActivity(tx, scope, {
          action: 'resubmitted',
          entityType: 'volunteer_application',
          entity: row,
          before: existing,
          eventId: event.id,
          values: APPLICATION_LOGGED_VALUES,
        });
        return { applicationId: row.id, updated: true };
      }
      const row = await this.planning.insertApplication(tx, {
        eventId: event.id,
        volunteerId: person.id,
        source: 'public',
        ...choices,
      });
      await recordActivity(tx, scope, {
        action: 'created',
        entityType: 'volunteer_application',
        entity: row,
        before: null,
        eventId: event.id,
        values: APPLICATION_LOGGED_VALUES,
      });
      return { applicationId: row.id, updated: false };
    });
  }

  private async find(slug: string) {
    const found = await this.planning.findBySlug(slug);
    if (!found) throw new NotFoundException('Event not found');
    return found;
  }
}
