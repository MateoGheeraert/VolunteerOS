'use client';

import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FieldError as HookFormFieldError } from 'react-hook-form';
import { FieldError } from '@/components/ui/field';

/**
 * Schemas and server errors carry translation keys (see src/i18n/keys.ts). These components
 * translate them; anything that isn't a key (a library message) is shown as it is.
 */
function useTranslateMessage() {
  const t = useTranslations();
  return (message: string) => (t.has(message as never) ? t(message as never) : message);
}

/** The form-level error under a form: something no single field explains. */
export function FormError({ message }: { message?: string | null }) {
  const translate = useTranslateMessage();
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-xl bg-status-bad-bg px-3.5 py-2.5 text-sm font-semibold text-status-bad"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {translate(message)}
    </p>
  );
}

/** The error under one field. */
export function FormFieldError({ error }: { error?: HookFormFieldError }) {
  const translate = useTranslateMessage();
  if (!error?.message) return null;
  return <FieldError>{translate(error.message)}</FieldError>;
}
