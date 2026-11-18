'use client';

import { Pencil } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AddressOutput } from '@/api/generated/types.gen';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useActionForm } from '@/hooks/use-action-form';
import { clearAddress, saveAddress } from '@/server/profile/actions';
import { ADDRESS_COUNTRIES, addressFormSchema, toAddressForm, type AddressForm } from './schemas';

/**
 * The address, saved as a whole: it only means something complete. Shown as text; "Wijzigen"
 * turns it into a small form in place.
 */
export function AddressField({ address }: { address: AddressOutput | null }) {
  const t = useTranslations();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const clear = useAction(clearAddress, {
    onSuccess: () => {
      setEditing(false);
      router.refresh();
    },
    onError: ({ error }) => toast.error(t(error.serverError?.message ?? 'common.genericError')),
  });
  const countryName = (code: string) => {
    const known = ADDRESS_COUNTRIES.find((country) => country === code);
    return known ? t(`settings.address.countries.${known}`) : code;
  };

  if (editing) {
    return (
      <AddressForm
        defaultValues={toAddressForm(address)}
        onDone={() => setEditing(false)}
        onClear={address ? () => clear.execute() : undefined}
      />
    );
  }
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      {address ? (
        <address className="not-italic">
          {address.street} {address.houseNumber}
          {address.box && ` ${t('settings.address.boxShort')} ${address.box}`}
          <br />
          {address.postalCode} {address.city}
          {address.country !== 'BE' && `, ${countryName(address.country)}`}
        </address>
      ) : (
        <span className="font-normal text-muted-foreground italic">
          {t('settings.address.empty')}
        </span>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
        <Pencil aria-hidden />
        {t('settings.address.edit')}
      </Button>
    </div>
  );
}

function AddressForm({
  defaultValues,
  onDone,
  onClear,
}: {
  defaultValues: AddressForm;
  onDone: () => void;
  onClear?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { form, onSubmit, formError, pending } = useActionForm(saveAddress, addressFormSchema, {
    defaultValues,
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  const { errors } = form.formState;

  const text = (name: Exclude<keyof AddressForm, 'country'>, autoComplete: string) => (
    <Field data-invalid={!!errors[name]}>
      <FieldLabel htmlFor={`address-${name}`}>{t(`settings.address.${name}`)}</FieldLabel>
      <Input
        id={`address-${name}`}
        autoComplete={autoComplete}
        aria-invalid={!!errors[name]}
        {...form.register(name)}
      />
      <FormFieldError error={errors[name]} />
    </Field>
  );

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      className="flex flex-col gap-4 font-normal"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_6rem_5rem]">
        {text('street', 'address-line1')}
        {text('houseNumber', 'address-line2')}
        {text('box', 'off')}
      </div>
      <div className="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)_10rem]">
        {text('postalCode', 'postal-code')}
        {text('city', 'address-level2')}
        <Field>
          <FieldLabel htmlFor="address-country">{t('settings.address.country')}</FieldLabel>
          <NativeSelect id="address-country" autoComplete="country" {...form.register('country')}>
            {ADDRESS_COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {t(`settings.address.countries.${code}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <FormError message={formError} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {t('common.save')}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        {onClear && (
          <Button type="button" variant="ghost" className="ml-auto" onClick={onClear}>
            {t('settings.address.clear')}
          </Button>
        )}
      </div>
    </form>
  );
}
