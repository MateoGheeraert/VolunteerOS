import { EmailLayout, Paragraph } from './_components/layout.js';
import { defineEmailTemplate } from './_components/define-template.js';
import { formatEmailDateTime } from './_components/theme.js';

export interface AccountDeletedProps {
  name: string;
  deletedAt: Date;
  /** Organizations that were deleted with the account, because it was their only member. */
  deletedOrganizations: string[];
}

/**
 * The last email to an account, sent to its address as it was before the deletion. The delivery
 * log keeps no copy of that address: its recipient is scrubbed right after sending.
 */
export default function AccountDeletedEmail({
  name,
  deletedAt,
  deletedOrganizations,
}: AccountDeletedProps) {
  return (
    <EmailLayout
      preview="Je VolunteerOS-account is verwijderd."
      heading="Je account is verwijderd"
      reason="dit het e-mailadres van je VolunteerOS-account was."
    >
      <Paragraph>Dag {name},</Paragraph>
      <Paragraph>
        Op {formatEmailDateTime(deletedAt)} werd je VolunteerOS-account verwijderd. Je
        persoonsgegevens zijn gewist en je kan je niet meer aanmelden. Taken en geschiedenis in je
        organisaties tonen je voortaan als &quot;Verwijderde gebruiker&quot;.
      </Paragraph>
      {deletedOrganizations.length > 0 && (
        <Paragraph>
          Omdat je er het enige lid van was, werden ook deze organisaties verwijderd:{' '}
          {deletedOrganizations.join(', ')}.
        </Paragraph>
      )}
      <Paragraph muted>
        Wil je VolunteerOS later opnieuw gebruiken? Dan kan je met dit e-mailadres een nieuw account
        aanmaken.
      </Paragraph>
      <Paragraph muted>
        Was jij dit niet? Neem dan meteen contact op met de beheerder van je organisatie.
      </Paragraph>
    </EmailLayout>
  );
}

export const accountDeleted = defineEmailTemplate<AccountDeletedProps>({
  component: AccountDeletedEmail,
  subject: () => 'Je account is verwijderd',
  previewProps: {
    name: 'Sofie',
    deletedAt: new Date('2026-11-18T14:05:00Z'),
    deletedOrganizations: ['Jeugdhuis De Kroon'],
  },
});
