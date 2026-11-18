import { EmailLayout, Paragraph } from './_components/layout.js';
import { defineEmailTemplate } from './_components/define-template.js';
import { formatEmailDateTime } from './_components/theme.js';

export interface EmailChangedProps {
  name: string;
  changedAt: Date;
}

/**
 * A security notice to the old address once the change is confirmed. It doesn't name the new
 * address: whoever reads the old mailbox doesn't need it.
 */
export default function EmailChangedEmail({ name, changedAt }: EmailChangedProps) {
  return (
    <EmailLayout
      preview="Het e-mailadres van je VolunteerOS-account is gewijzigd."
      heading="Je e-mailadres is gewijzigd"
      reason="dit het vorige e-mailadres van je VolunteerOS-account was."
    >
      <Paragraph>Dag {name},</Paragraph>
      <Paragraph>
        Op {formatEmailDateTime(changedAt)} werd het e-mailadres van je VolunteerOS-account
        gewijzigd. Je meldt je voortaan aan met het nieuwe adres; naar dit adres sturen we niets
        meer.
      </Paragraph>
      <Paragraph muted>
        Was jij dit niet? Neem dan meteen contact op met de beheerder van je organisatie.
      </Paragraph>
    </EmailLayout>
  );
}

export const emailChanged = defineEmailTemplate<EmailChangedProps>({
  component: EmailChangedEmail,
  subject: () => 'Je e-mailadres is gewijzigd',
  previewProps: { name: 'Sofie', changedAt: new Date('2026-11-18T14:05:00Z') },
});
