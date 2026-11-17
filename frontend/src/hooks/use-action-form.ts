'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useHookFormAction } from '@next-safe-action/adapter-react-hook-form/hooks';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { SingleInputActionFn } from 'next-safe-action/hooks';
import { useState } from 'react';
import type { DefaultValues, FieldValues } from 'react-hook-form';
import type { z } from 'zod';
import type { MessageKey } from '@/i18n/keys';
import type { ActionError } from '@/server/action-client';

/**
 * The one way a form talks to a server action. Validates with the same schema as the action,
 * shows validation errors per field (client and server), marks fields Nest rejected, and exposes
 * the form-level error as a translation key.
 *
 *   const { form, onSubmit, formError, pending } = useActionForm(createEvent, eventFormSchema, {
 *     defaultValues,
 *     onSuccess: (data) => router.push(`/events/${data.id}`),
 *   });
 */
export function useActionForm<Schema extends z.ZodType<FieldValues, FieldValues>, Data>(
  action: SingleInputActionFn<ActionError, Schema, unknown, Data>,
  schema: Schema,
  options: {
    defaultValues: DefaultValues<StandardSchemaV1.InferInput<Schema>>;
    onSuccess?: (data: Data, input: StandardSchemaV1.InferInput<Schema>) => void;
  },
) {
  const [formError, setFormError] = useState<MessageKey | null>(null);

  const {
    form,
    handleSubmitWithAction,
    action: state,
  } = useHookFormAction(
    action,
    // The adapter types the form through Standard Schema, zodResolver through Zod: the same types,
    // but TypeScript can't prove it for a generic schema. The public signature stays fully typed.
    zodResolver(schema) as never,
    {
      formProps: { defaultValues: options.defaultValues as never },
      actionProps: {
        onExecute: () => setFormError(null),
        onSuccess: ({ data, input }) => options.onSuccess?.(data as Data, input),
        onError: ({ error }) => {
          const serverError = error.serverError;
          if (!serverError) return;
          setFormError(serverError.message);
          for (const field of serverError.fields ?? []) {
            form.setError(field as never, { message: 'common.invalidField' });
          }
        },
      },
    },
  );

  return { form, onSubmit: handleSubmitWithAction, formError, pending: state.isPending };
}
