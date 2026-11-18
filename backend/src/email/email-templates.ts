import { render } from 'react-email';
import type { EmailTemplate } from './templates/_components/define-template.js';
import { organizationInvitation } from './templates/organization-invitation.js';
import { passwordReset } from './templates/password-reset.js';

/**
 * Every email the app can send. To add one: create `templates/<name>.tsx` with
 * `defineEmailTemplate(...)` and add a line here. Nothing else changes: `EmailService.send`
 * type-checks the props against the template, and delivery, retries and logging are shared.
 */
export const emailTemplates = {
  'organization-invitation': organizationInvitation,
  'password-reset': passwordReset,
};

export type EmailTemplateName = keyof typeof emailTemplates;

export type EmailTemplateProps<Name extends EmailTemplateName> =
  (typeof emailTemplates)[Name] extends EmailTemplate<infer Props> ? Props : never;

export interface RenderedEmail {
  subject: string;
  html: string;
  /** Generated from the HTML, for clients that don't show HTML and for spam filters. */
  text: string;
}

export async function renderEmail<Name extends EmailTemplateName>(
  name: Name,
  props: EmailTemplateProps<Name>,
): Promise<RenderedEmail> {
  const template = emailTemplates[name] as unknown as EmailTemplate<EmailTemplateProps<Name>>;
  const element = template.component(props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: template.subject(props), html, text };
}
