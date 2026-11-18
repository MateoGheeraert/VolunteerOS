import { CallToAction, EmailLayout, Paragraph } from './_components/layout.js';
import { defineEmailTemplate } from './_components/define-template.js';

export interface EmailChangeConfirmationProps {
  name: string;
  confirmUrl: string;
  /** How long the link works, in hours. */
  validForHours: number;
}

/** Sent to the new address: the email only changes once this link is opened. */
export default function EmailChangeConfirmationEmail({
  name,
  confirmUrl,
  validForHours,
}: EmailChangeConfirmationProps) {
  return (
    <EmailLayout
      preview="Bevestig je nieuwe e-mailadres voor VolunteerOS."
      heading="Bevestig je nieuwe e-mailadres"
      reason="dit adres werd opgegeven als nieuw e-mailadres van een VolunteerOS-account."
    >
      <Paragraph>Dag {name},</Paragraph>
      <Paragraph>
        Je wil voortaan dit e-mailadres gebruiken voor VolunteerOS. Bevestig het met de knop
        hieronder; pas dan wordt het gewijzigd.
      </Paragraph>
      <CallToAction href={confirmUrl}>Nieuw e-mailadres bevestigen</CallToAction>
      <Paragraph muted>Deze link is {validForHours} uur geldig.</Paragraph>
      <Paragraph muted>
        Heb je dit niet aangevraagd? Dan hoef je niets te doen; er verandert niets.
      </Paragraph>
    </EmailLayout>
  );
}

export const emailChangeConfirmation = defineEmailTemplate<EmailChangeConfirmationProps>({
  component: EmailChangeConfirmationEmail,
  subject: () => 'Bevestig je nieuwe e-mailadres',
  previewProps: {
    name: 'Sofie',
    confirmUrl: 'http://localhost:3000/verify-email?token=example-token',
    validForHours: 24,
  },
});
