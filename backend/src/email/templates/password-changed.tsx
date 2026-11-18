import { CallToAction, EmailLayout, Paragraph } from './_components/layout.js';
import { defineEmailTemplate } from './_components/define-template.js';
import { formatEmailDateTime } from './_components/theme.js';

export interface PasswordChangedProps {
  name: string;
  changedAt: Date;
  /** Where to choose a new password if this wasn't them. */
  resetUrl: string;
}

/** A security notice after the password was changed or reset. */
export default function PasswordChangedEmail({ name, changedAt, resetUrl }: PasswordChangedProps) {
  return (
    <EmailLayout
      preview="Het wachtwoord van je VolunteerOS-account is gewijzigd."
      heading="Je wachtwoord is gewijzigd"
      reason="het wachtwoord van je VolunteerOS-account werd gewijzigd."
    >
      <Paragraph>Dag {name},</Paragraph>
      <Paragraph>
        Op {formatEmailDateTime(changedAt)} werd het wachtwoord van je VolunteerOS-account
        gewijzigd.
      </Paragraph>
      <Paragraph muted>Was jij dit? Dan hoef je niets te doen.</Paragraph>
      <Paragraph muted>Was jij dit niet? Kies dan meteen een nieuw wachtwoord:</Paragraph>
      <CallToAction href={resetUrl}>Nieuw wachtwoord kiezen</CallToAction>
    </EmailLayout>
  );
}

export const passwordChanged = defineEmailTemplate<PasswordChangedProps>({
  component: PasswordChangedEmail,
  subject: () => 'Je wachtwoord is gewijzigd',
  previewProps: {
    name: 'Sofie',
    changedAt: new Date('2026-11-18T14:05:00Z'),
    resetUrl: 'http://localhost:3000/forgot-password',
  },
});
