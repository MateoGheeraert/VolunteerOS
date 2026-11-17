import type { EmailMessage } from './email.service.js';

export function organizationInvitationEmail(input: {
  to: string;
  organizationName: string;
  inviterName: string;
  acceptUrl: string;
}): EmailMessage {
  // Dutch first (initial market: Flanders). Move to a proper i18n/React Email setup later.
  return {
    to: input.to,
    subject: `Uitnodiging voor ${input.organizationName} op VolunteerOS`,
    text: [
      `${input.inviterName} nodigt je uit om mee te organiseren bij ${input.organizationName}.`,
      '',
      `Aanvaard de uitnodiging: ${input.acceptUrl}`,
      '',
      'Deze link is 7 dagen geldig.',
    ].join('\n'),
  };
}

export function passwordResetEmail(input: {
  to: string;
  name: string;
  resetUrl: string;
}): EmailMessage {
  return {
    to: input.to,
    subject: 'Stel een nieuw wachtwoord in voor VolunteerOS',
    text: [
      `Dag ${input.name},`,
      '',
      'Je vroeg om een nieuw wachtwoord. Kies er een via deze link:',
      input.resetUrl,
      '',
      'De link is 1 uur geldig. Heb je dit niet gevraagd? Dan mag je deze mail negeren.',
    ].join('\n'),
  };
}
