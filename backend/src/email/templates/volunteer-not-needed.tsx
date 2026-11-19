import { defineEmailTemplate } from './_components/define-template.js';
import { EmailLayout, Paragraph } from './_components/layout.js';

export interface VolunteerNotNeededProps {
  volunteerName: string;
  eventName: string;
  organizationName: string;
}

/** Sent on publish (when the organizer asks for it) to volunteers who got no shift this time. */
export default function VolunteerNotNeededEmail(props: VolunteerNotNeededProps) {
  const { volunteerName, eventName, organizationName } = props;
  return (
    <EmailLayout
      preview={`Bedankt voor je inschrijving voor ${eventName}.`}
      heading="Bedankt om je aan te bieden!"
      reason={`je je inschreef als vrijwilliger voor ${eventName}.`}
    >
      <Paragraph>Dag {volunteerName},</Paragraph>
      <Paragraph>
        Er boden zich zoveel vrijwilligers aan voor {eventName} dat {organizationName} je deze keer
        niet nodig heeft. Fijn dat je wou helpen!
      </Paragraph>
      <Paragraph>
        Valt er toch nog iemand uit, dan nemen de organisatoren misschien contact met je op.
      </Paragraph>
      <Paragraph muted>Vragen? Antwoord gewoon op deze e-mail.</Paragraph>
    </EmailLayout>
  );
}

export const volunteerNotNeeded = defineEmailTemplate<VolunteerNotNeededProps>({
  component: VolunteerNotNeededEmail,
  subject: ({ eventName }) => `Bedankt voor je inschrijving voor ${eventName}`,
  previewProps: {
    volunteerName: 'Jan',
    eventName: 'Kerstmarkt 2026',
    organizationName: 'Chiro Sint-Jan',
  },
});
