import type { ReactElement } from 'react';

/**
 * One email: its React component, its subject line and example props. The example props are
 * shown by the preview server (`pnpm email:dev`) and sent by `pnpm email:test`.
 */
export interface EmailTemplate<Props> {
  component: (props: Props) => ReactElement;
  subject: (props: Props) => string;
  previewProps: Props;
}

export function defineEmailTemplate<Props>(template: EmailTemplate<Props>): EmailTemplate<Props> {
  // The preview server reads example props from the component's default export.
  Object.assign(template.component, { PreviewProps: template.previewProps });
  return template;
}
