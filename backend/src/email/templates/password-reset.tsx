import { CallToAction, EmailLayout, Paragraph } from './_components/layout.js';
import { defineEmailTemplate } from './_components/define-template.js';

export interface PasswordResetProps {
  name: string;
  resetUrl: string;
  /** How long the link works, in hours. */
  validForHours: number;
}

export default function PasswordResetEmail({ name, resetUrl, validForHours }: PasswordResetProps) {
  return (
    <EmailLayout
      preview="Kies een nieuw wachtwoord voor je VolunteerOS-account."
      heading="Stel je wachtwoord opnieuw in"
      reason="er een nieuw wachtwoord werd aangevraagd voor je VolunteerOS-account."
    >
      <Paragraph>Dag {name},</Paragraph>
      <Paragraph>Je vroeg om een nieuw wachtwoord. Kies er een via de knop hieronder.</Paragraph>
      <CallToAction href={resetUrl}>Nieuw wachtwoord instellen</CallToAction>
      <Paragraph muted>Deze link is {validForHours} uur geldig.</Paragraph>
      <Paragraph muted>
        Heb je dit niet aangevraagd? Dan hoef je niets te doen; je wachtwoord blijft ongewijzigd.
      </Paragraph>
    </EmailLayout>
  );
}

export const passwordReset = defineEmailTemplate<PasswordResetProps>({
  component: PasswordResetEmail,
  subject: () => 'Stel je wachtwoord opnieuw in',
  previewProps: {
    name: 'Sofie',
    resetUrl: 'http://localhost:3000/reset-password?token=example-token',
    validForHours: 1,
  },
});
