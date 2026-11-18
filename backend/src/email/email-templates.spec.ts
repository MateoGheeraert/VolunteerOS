import { describe, expect, it } from 'vitest';
import { emailTemplates, renderEmail, type EmailTemplateName } from './email-templates.js';

const names = Object.keys(emailTemplates) as EmailTemplateName[];

describe('email templates', () => {
  it.each(names)(
    '%s renders Dutch HTML and a plain-text version from its preview props',
    async (name) => {
      const { previewProps } = emailTemplates[name];
      const email = await renderEmail(name, previewProps as never);

      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.html).toMatch(/<html[^>]* lang="nl"/);
      expect(email.html).not.toContain('lang="en"');
      expect(email.html).toContain('VolunteerOS');
      expect(email.html).toContain('Je ontvangt deze e-mail omdat');
      expect(email.text).not.toContain('<');
      expect(email.text).toContain('Je ontvangt deze e-mail omdat');
    },
  );

  it('puts the accept link, role and expiry date in the invitation', async () => {
    const email = await renderEmail('organization-invitation', {
      inviterName: 'Sofie Peeters',
      organizationName: 'Jeugdhuis De Kroon',
      role: 'member',
      acceptUrl: 'https://app.example.com/invitations/abc123',
      // 23:30 UTC is already the next day in Brussels.
      expiresAt: new Date('2026-11-24T23:30:00Z'),
    });

    expect(email.subject).toBe(
      'Sofie Peeters nodigt je uit voor Jeugdhuis De Kroon op VolunteerOS',
    );
    expect(email.html).toContain('href="https://app.example.com/invitations/abc123"');
    expect(email.text).toContain('Uitnodiging bekijken https://app.example.com/invitations/abc123');
    // The "button doesn't work?" fallback is for HTML only: the plain text has the link once.
    expect(email.text.split('https://app.example.com/invitations/abc123')).toHaveLength(2);
    expect(email.text).toContain('Uitnodiging bekijken');
    expect(email.text).toContain('lid');
    expect(email.text).toContain('25 november 2026');
  });

  it('escapes names, so a crafted organization name cannot inject HTML', async () => {
    const email = await renderEmail('organization-invitation', {
      ...emailTemplates['organization-invitation'].previewProps,
      organizationName: '<script>alert(1)</script>',
    });

    expect(email.html).not.toContain('<script>');
  });

  it('puts the reset link and how long it is valid in the password reset email', async () => {
    const email = await renderEmail('password-reset', {
      name: 'Sofie',
      resetUrl: 'https://app.example.com/reset-password?token=t0k3n',
      validForHours: 1,
    });

    expect(email.subject).toBe('Stel je wachtwoord opnieuw in');
    expect(email.text).toContain('Dag Sofie,');
    expect(email.text).toContain('https://app.example.com/reset-password?token=t0k3n');
    expect(email.text).toContain('Deze link is 1 uur geldig.');
  });
});
