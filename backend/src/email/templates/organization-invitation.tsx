import { CallToAction, EmailLayout, Paragraph } from './_components/layout.js';
import { defineEmailTemplate } from './_components/define-template.js';
import { formatEmailDate } from './_components/theme.js';

export interface OrganizationInvitationProps {
  inviterName: string;
  organizationName: string;
  /** Better Auth role: owner, admin or member. */
  role: string;
  acceptUrl: string;
  expiresAt: Date;
}

// Same labels as the app (frontend/src/messages/nl.json → members.roles).
const ROLE_LABELS: Record<string, string> = {
  owner: 'eigenaar',
  admin: 'beheerder',
  member: 'lid',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export default function OrganizationInvitationEmail({
  inviterName,
  organizationName,
  role,
  acceptUrl,
  expiresAt,
}: OrganizationInvitationProps) {
  return (
    <EmailLayout
      preview={`Word ${roleLabel(role)} van ${organizationName} op VolunteerOS.`}
      heading={`Je bent uitgenodigd voor ${organizationName}`}
      reason="iemand je uitnodigde voor een organisatie op VolunteerOS."
    >
      <Paragraph>
        {inviterName} nodigt je uit om als <strong>{roleLabel(role)}</strong> mee te organiseren bij{' '}
        <strong>{organizationName}</strong> op VolunteerOS.
      </Paragraph>
      <CallToAction href={acceptUrl}>Uitnodiging bekijken</CallToAction>
      <Paragraph muted>Deze uitnodiging verloopt op {formatEmailDate(expiresAt)}.</Paragraph>
      <Paragraph muted>
        Verwacht je deze uitnodiging niet? Dan mag je deze e-mail negeren.
      </Paragraph>
    </EmailLayout>
  );
}

export const organizationInvitation = defineEmailTemplate<OrganizationInvitationProps>({
  component: OrganizationInvitationEmail,
  subject: ({ inviterName, organizationName }) =>
    `${inviterName} nodigt je uit voor ${organizationName} op VolunteerOS`,
  previewProps: {
    inviterName: 'Sofie Peeters',
    organizationName: 'Jeugdhuis De Kroon',
    role: 'admin',
    acceptUrl: 'http://localhost:3000/invitations/example-invitation-id',
    expiresAt: new Date('2026-11-25T12:00:00+01:00'),
  },
});
