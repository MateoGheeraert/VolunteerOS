import { defineEmailTemplate } from './_components/define-template.js';
import { EmailLayout, Paragraph } from './_components/layout.js';
import { ShiftList, type EmailShift } from './_components/shift-list.js';

export interface VolunteerScheduleProps {
  volunteerName: string;
  eventName: string;
  organizationName: string;
  location: string | null;
  /** The schedule changed since the last email: this one replaces it. */
  updated: boolean;
  shifts: EmailShift[];
}

/** The volunteer's confirmed shifts, sent when an organizer publishes the schedule. */
export default function VolunteerScheduleEmail(props: VolunteerScheduleProps) {
  const { volunteerName, eventName, organizationName, location, updated, shifts } = props;
  const noun = shifts.length === 1 ? 'shift' : 'shiften';
  return (
    <EmailLayout
      preview={`Je shiften voor ${eventName}.`}
      heading={
        updated ? `Je shiften voor ${eventName} zijn gewijzigd` : `Je shiften voor ${eventName}`
      }
      reason={`je je inschreef als vrijwilliger voor ${eventName}.`}
    >
      <Paragraph>Dag {volunteerName},</Paragraph>
      <Paragraph>
        {updated
          ? `${organizationName} heeft de planning aangepast. Dit zijn nu je shiften (ze vervangen die uit de vorige e-mail):`
          : `Bedankt dat je komt helpen! ${organizationName} heeft je ingepland voor deze ${noun}:`}
      </Paragraph>
      <ShiftList shifts={shifts} />
      {location && <Paragraph>Locatie: {location}</Paragraph>}
      <Paragraph muted>
        Lukt het toch niet? Antwoord dan op deze e-mail, dan zoeken de organisatoren een oplossing.
      </Paragraph>
    </EmailLayout>
  );
}

export const volunteerSchedule = defineEmailTemplate<VolunteerScheduleProps>({
  component: VolunteerScheduleEmail,
  subject: ({ eventName, updated }) =>
    updated ? `Gewijzigd: je shiften voor ${eventName}` : `Je shiften voor ${eventName}`,
  previewProps: {
    volunteerName: 'Jan',
    eventName: 'Kerstmarkt 2026',
    organizationName: 'Chiro Sint-Jan',
    location: 'Marktplein, Merkem',
    updated: false,
    shifts: [
      {
        teamName: 'Bar',
        startsAt: new Date('2026-12-12T18:00:00+01:00'),
        endsAt: new Date('2026-12-12T21:00:00+01:00'),
        meetingPoint: 'Achter de bartent',
      },
    ],
  },
});
