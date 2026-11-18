import { CallToAction, EmailLayout, Paragraph } from './_components/layout.js';
import { defineEmailTemplate } from './_components/define-template.js';

export interface EmailVerificationProps {
  name: string;
  verifyUrl: string;
  /** How long the link works, in hours. */
  validForHours: number;
}

export default function EmailVerificationEmail({
  name,
  verifyUrl,
  validForHours,
}: EmailVerificationProps) {
  return (
    <EmailLayout
      preview="Bevestig het e-mailadres van je VolunteerOS-account."
      heading="Bevestig je e-mailadres"
      reason="je een VolunteerOS-account hebt met dit e-mailadres."
    >
      <Paragraph>Dag {name},</Paragraph>
      <Paragraph>
        Bevestig met de knop hieronder dat dit e-mailadres van jou is. Zo komen uitnodigingen en
        meldingen zeker aan.
      </Paragraph>
      <CallToAction href={verifyUrl}>E-mailadres bevestigen</CallToAction>
      <Paragraph muted>Deze link is {validForHours} uur geldig.</Paragraph>
      <Paragraph muted>Heb je geen account aangemaakt? Dan mag je deze e-mail negeren.</Paragraph>
    </EmailLayout>
  );
}

export const emailVerification = defineEmailTemplate<EmailVerificationProps>({
  component: EmailVerificationEmail,
  subject: () => 'Bevestig je e-mailadres',
  previewProps: {
    name: 'Sofie',
    verifyUrl: 'http://localhost:3000/verify-email?token=example-token',
    validForHours: 24,
  },
});
