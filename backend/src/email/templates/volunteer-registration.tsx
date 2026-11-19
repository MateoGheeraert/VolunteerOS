import { defineEmailTemplate } from './_components/define-template.js';
import { EmailLayout, Paragraph } from './_components/layout.js';
import { ShiftList, type EmailShift } from './_components/shift-list.js';
import { formatEmailDate } from './_components/theme.js';

export interface VolunteerRegistrationProps {
  volunteerName: string;
  eventName: string;
  organizationName: string;
  eventStartsAt: Date;
  /** A second sign-up with the same email replaced the first. */
  updated: boolean;
  wholeEvent: boolean;
  /** The shifts the volunteer marked as available. */
  shifts: EmailShift[];
  preferredTeamName: string | null;
}

/**
 * Sent after every sign-up on the public page. An acknowledgement, not a schedule: the organizers
 * still have to place the volunteer (docs/info.md §7.5).
 */
export default function VolunteerRegistrationEmail(props: VolunteerRegistrationProps) {
  const { volunteerName, eventName, organizationName, eventStartsAt, updated } = props;
  const date = formatEmailDate(eventStartsAt);
  return (
    <EmailLayout
      preview={`${organizationName} heeft je inschrijving voor ${eventName} ontvangen.`}
      heading={updated ? 'Je inschrijving is bijgewerkt' : 'Bedankt voor je inschrijving!'}
      reason={`je je inschreef als vrijwilliger voor ${eventName}.`}
    >
      <Paragraph>Dag {volunteerName},</Paragraph>
      <Paragraph>
        {updated
          ? `We hebben je nieuwe antwoorden voor ${eventName} (${date}) goed ontvangen. Ze vervangen je vorige inschrijving.`
          : `${organizationName} heeft je inschrijving als vrijwilliger voor ${eventName} (${date}) goed ontvangen.`}
      </Paragraph>
      {props.wholeEvent ? (
        <Paragraph>Je gaf aan dat je het hele evenement beschikbaar bent.</Paragraph>
      ) : (
        props.shifts.length > 0 && (
          <>
            <Paragraph>Je gaf aan dat je deze shiften kan doen:</Paragraph>
            <ShiftList shifts={props.shifts} />
          </>
        )
      )}
      {props.preferredTeamName && (
        <Paragraph>Je liefste team: {props.preferredTeamName}.</Paragraph>
      )}
      <Paragraph>
        Dit is nog geen planning. De organisatoren verdelen iedereen over de shiften en sturen je
        daarna een e-mail met je definitieve shiften.
      </Paragraph>
      <Paragraph muted>
        Iets veranderd? Vul het formulier gewoon opnieuw in met hetzelfde e-mailadres. Heb je je
        niet zelf ingeschreven? Laat het de organisatoren weten.
      </Paragraph>
    </EmailLayout>
  );
}

export const volunteerRegistration = defineEmailTemplate<VolunteerRegistrationProps>({
  component: VolunteerRegistrationEmail,
  subject: ({ eventName, updated }) =>
    updated
      ? `Je inschrijving voor ${eventName} is bijgewerkt`
      : `Je inschrijving voor ${eventName} is ontvangen`,
  previewProps: {
    volunteerName: 'Jan',
    eventName: 'Kerstmarkt 2026',
    organizationName: 'Chiro Sint-Jan',
    eventStartsAt: new Date('2026-12-12T14:00:00+01:00'),
    updated: false,
    wholeEvent: false,
    shifts: [
      {
        teamName: 'Bar',
        startsAt: new Date('2026-12-12T18:00:00+01:00'),
        endsAt: new Date('2026-12-12T21:00:00+01:00'),
      },
      {
        teamName: 'Afbraak',
        startsAt: new Date('2026-12-12T23:00:00+01:00'),
        endsAt: new Date('2026-12-13T01:00:00+01:00'),
      },
    ],
    preferredTeamName: 'Bar',
  },
});
