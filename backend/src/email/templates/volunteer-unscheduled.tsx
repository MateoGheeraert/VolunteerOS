import { defineEmailTemplate } from './_components/define-template.js';
import { EmailLayout, Paragraph } from './_components/layout.js';

export interface VolunteerUnscheduledProps {
  volunteerName: string;
  eventName: string;
  organizationName: string;
}

/** Sent on publish to a volunteer who lost every shift since the last schedule email. */
export default function VolunteerUnscheduledEmail(props: VolunteerUnscheduledProps) {
  const { volunteerName, eventName, organizationName } = props;
  return (
    <EmailLayout
      preview={`Je staat niet meer ingepland voor ${eventName}.`}
      heading={`Je staat niet meer ingepland voor ${eventName}`}
      reason={`je je inschreef als vrijwilliger voor ${eventName}.`}
    >
      <Paragraph>Dag {volunteerName},</Paragraph>
      <Paragraph>
        {organizationName} heeft de planning voor {eventName} aangepast. Je staat voorlopig niet
        meer op een shift: de shiften uit de vorige e-mail vervallen.
      </Paragraph>
      <Paragraph muted>
        Is dit een vergissing, of wil je toch graag helpen? Antwoord gewoon op deze e-mail.
      </Paragraph>
    </EmailLayout>
  );
}

export const volunteerUnscheduled = defineEmailTemplate<VolunteerUnscheduledProps>({
  component: VolunteerUnscheduledEmail,
  subject: ({ eventName }) => `Je staat niet meer ingepland voor ${eventName}`,
  previewProps: {
    volunteerName: 'Jan',
    eventName: 'Kerstmarkt 2026',
    organizationName: 'Chiro Sint-Jan',
  },
});
