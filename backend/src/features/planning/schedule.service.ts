import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { recordActivity } from '../../activity/activity-log.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database } from '../../db/database.js';
import type { EventRow, ScheduleEntry } from '../../db/schema/index.js';
import { EmailService } from '../../email/email.service.js';
import { scheduleNotice, type ScheduleNotice } from './planning-rules.js';
import {
  assertWritable,
  confirmedSchedule,
  REGISTRATION_LOGGED_VALUES,
} from './planning.mappers.js';
import { PlanningRepository, type ApplicationView } from './planning.repository.js';
import type {
  NotifyResultDto,
  PublishResultDto,
  PublishScheduleInput,
  SchedulePreviewDto,
} from './planning.schemas.js';

interface Recipient {
  application: ApplicationView;
  kind: ScheduleNotice;
  shifts: ScheduleEntry[];
}

/**
 * Sending the schedule, once: when the organizer states everyone is assigned and nothing will
 * change, every volunteer with confirmed shifts gets them by email, and optionally those without
 * a shift a thank-you. Proposals must be confirmed or removed first.
 *
 * After that there is no second batch: a volunteer whose shifts change is told one by one, when
 * the organizer chooses (`notify`). That also covers emails that failed during the send.
 *
 * One email per volunteer, so one bad address doesn't stop the rest. What was sent is stored on
 * the application only after its email went out.
 */
@Injectable()
export class ScheduleService {
  private readonly logger = new Logger('Schedule');

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly planning: PlanningRepository,
    private readonly email: EmailService,
  ) {}

  async preview(event: EventRow): Promise<SchedulePreviewDto> {
    const { recipients, proposedCount } = await this.recipients(event);
    return {
      proposedCount,
      recipients: recipients.map(({ application, kind, shifts }) => ({
        applicationId: application.id,
        name: application.name,
        email: application.email,
        phone: application.phone,
        kind,
        shifts,
      })),
    };
  }

  async publish(
    org: OrgContext,
    event: EventRow,
    input: PublishScheduleInput,
  ): Promise<PublishResultDto> {
    assertWritable(event);
    if (event.schedulePublishedAt) {
      throw new ConflictException('The schedule was already sent');
    }
    const { recipients, proposedCount } = await this.recipients(event);
    if (proposedCount > 0) {
      throw new ConflictException('Confirm or remove the proposed assignments first');
    }
    // Claim the one send before emailing anyone: of two organizers (or tabs) sending at the same
    // time, only the first gets past this; the other answers 409 and sends nothing.
    await this.db.transaction(async (tx) => {
      const claimed = await this.planning.claimSchedulePublish(tx, event.id);
      if (!claimed) throw new ConflictException('The schedule was already sent');
      await recordActivity(tx, org, {
        action: 'updated',
        entityType: 'event',
        entity: claimed,
        before: event,
        eventId: event.id,
        values: REGISTRATION_LOGGED_VALUES,
      });
    });
    const chosen = recipients.filter((r) => input.includeNotNeeded || r.kind !== 'not_needed');
    const [organizationName, replyTo] = await Promise.all([
      this.planning.findOrganizationName(event.organizationId),
      this.planning.findUserEmail(org.userId),
    ]);
    // A failed email is not retried here: its volunteer keeps a pending notice on the board and
    // is told later with `notify`, under a new key.
    const publicationId = randomUUID();

    let sent = 0;
    let withoutEmail = 0;
    const failed: PublishResultDto['failed'] = [];
    for (const recipient of chosen) {
      const { application } = recipient;
      if (application.email) {
        try {
          await this.send(
            recipient,
            application.email,
            event,
            organizationName,
            replyTo,
            publicationId,
          );
          sent++;
        } catch (error) {
          this.logger.warn(
            `Schedule email for application ${application.id} failed: ${String(error)}`,
          );
          failed.push({ applicationId: application.id, name: application.name });
          continue;
        }
      } else {
        // No address: the dialog listed them for the organizer to contact. Counts as told.
        withoutEmail++;
      }
      await this.recordNotified(org, event, application.id, recipient.shifts, {
        kind: recipient.kind,
        emailed: application.email !== null,
      });
    }

    await recordActivity(this.db, org, {
      action: 'schedule_published',
      entityType: 'event',
      entity: { id: event.id, sent, failed: failed.length, withoutEmail },
      before: null,
      eventId: event.id,
      values: ['sent', 'failed', 'withoutEmail'],
    });
    return { sent, failed, withoutEmail };
  }

  /**
   * Tells one volunteer about their changed shifts, after the schedule was sent. Without an email
   * address the organizer told them in person: it is only recorded.
   */
  async notify(org: OrgContext, event: EventRow, applicationId: string): Promise<NotifyResultDto> {
    assertWritable(event);
    if (!event.schedulePublishedAt) {
      throw new ConflictException('Send the schedule first');
    }
    const [teams, shifts, assignments, application] = await Promise.all([
      this.planning.listTeams(event.id),
      this.planning.listShifts(event.id),
      this.planning.listAssignments(event.id),
      this.planning.findApplication(event.id, applicationId),
    ]);
    if (!application) throw new NotFoundException('Volunteer not found');
    const current = confirmedSchedule(application.id, shifts, teams, assignments);
    const kind = scheduleNotice(current, application.notifiedSchedule, false);
    if (!kind || kind === 'not_needed') {
      throw new ConflictException('Nothing changed for this volunteer');
    }

    let emailed = false;
    if (application.email) {
      const [organizationName, replyTo] = await Promise.all([
        this.planning.findOrganizationName(event.organizationId),
        this.planning.findUserEmail(org.userId),
      ]);
      // A new key per notice: the same volunteer may be told about a later change too.
      await this.send(
        { application, kind, shifts: current },
        application.email,
        event,
        organizationName,
        replyTo,
        `notify-${randomUUID()}`,
      );
      emailed = true;
    }
    await this.recordNotified(org, event, application.id, current, { kind, emailed });
    return { emailed };
  }

  /** Stores what the volunteer was told, and logs it, in one transaction. */
  private recordNotified(
    org: OrgContext,
    event: EventRow,
    applicationId: string,
    schedule: ScheduleEntry[],
    told: { kind: ScheduleNotice; emailed: boolean },
  ) {
    return this.db.transaction(async (tx) => {
      const row = await this.planning.setNotifiedSchedule(tx, applicationId, schedule);
      await recordActivity(tx, org, {
        action: 'volunteer_notified',
        entityType: 'volunteer_application',
        entity: { id: row.id, ...told },
        before: null,
        eventId: event.id,
        values: ['kind', 'emailed'],
      });
    });
  }

  private send(
    { application, kind, shifts }: Recipient,
    to: string,
    event: EventRow,
    organizationName: string,
    replyTo: string | undefined,
    publicationId: string,
  ) {
    const common = {
      to,
      replyTo,
      organizationId: event.organizationId,
      eventId: event.id,
    };
    const names = {
      volunteerName: application.name,
      eventName: event.name,
      organizationName,
    };
    const key = (template: string) => `${template}:${publicationId}:${application.id}`;
    if (kind === 'schedule' || kind === 'updated') {
      return this.email.send({
        ...common,
        template: 'volunteer-schedule',
        idempotencyKey: key('volunteer-schedule'),
        props: {
          ...names,
          location: event.location,
          updated: kind === 'updated',
          shifts: shifts.map((s) => ({
            teamName: s.teamName,
            startsAt: new Date(s.startsAt),
            endsAt: new Date(s.endsAt),
            meetingPoint: s.meetingPoint,
          })),
        },
      });
    }
    if (kind === 'removed') {
      return this.email.send({
        ...common,
        template: 'volunteer-unscheduled',
        idempotencyKey: key('volunteer-unscheduled'),
        props: names,
      });
    }
    return this.email.send({
      ...common,
      template: 'volunteer-not-needed',
      idempotencyKey: key('volunteer-not-needed'),
      props: names,
    });
  }

  private async recipients(event: EventRow) {
    const [teams, shifts, applications, assignments] = await Promise.all([
      this.planning.listTeams(event.id),
      this.planning.listShifts(event.id),
      this.planning.listApplications(event.id),
      this.planning.listAssignments(event.id),
    ]);
    const recipients: Recipient[] = [];
    for (const application of applications) {
      const current = confirmedSchedule(application.id, shifts, teams, assignments);
      const kind = scheduleNotice(current, application.notifiedSchedule, true);
      if (kind) recipients.push({ application, kind, shifts: current });
    }
    recipients.sort((a, b) => a.application.name.localeCompare(b.application.name, 'nl'));
    return {
      recipients,
      proposedCount: assignments.filter((a) => a.status === 'proposed').length,
    };
  }
}
