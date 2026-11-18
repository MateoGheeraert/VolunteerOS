'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { organizationSchema } from '@/features/auth/schemas';
import { ORGANIZATION_CATEGORIES, type OrganizationCategory } from './profile';
import { authClient } from '@/lib/auth-client';
import { slugify } from '@/lib/navigation';

/** Finds a free slug: "klj-merkem", then "klj-merkem-2", "klj-merkem-3", … */
async function freeSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 1; attempt <= 20; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    const { data } = await authClient.organization.checkSlug({ slug });
    if (data?.status) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export function CreateOrganizationForm() {
  const t = useTranslations();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(organizationSchema),
    // Empty until chosen: the select starts on "Kies een soort".
    defaultValues: { name: '', category: '' as OrganizationCategory },
  });

  const onSubmit = form.handleSubmit(async ({ name, category }) => {
    setFormError(null);
    // The slug is never shown (organizations are not in URLs); it only has to be unique.
    const { data, error } = await authClient.organization.create({
      name,
      category,
      slug: await freeSlug(name),
    });
    if (error || !data) {
      setFormError(t('common.genericError'));
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    router.push('/events');
    router.refresh();
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">{t('onboarding.title')}</h1>
        <p className="text-muted-foreground">{t('onboarding.subtitle')}</p>
      </div>
      <Field data-invalid={!!form.formState.errors.name}>
        <FieldLabel htmlFor="name">{t('onboarding.name')}</FieldLabel>
        <Input
          id="name"
          placeholder={t('onboarding.namePlaceholder')}
          aria-invalid={!!form.formState.errors.name}
          {...form.register('name')}
        />
        <FormFieldError error={form.formState.errors.name} />
      </Field>
      <Field data-invalid={!!form.formState.errors.category}>
        <FieldLabel htmlFor="category">{t('onboarding.category')}</FieldLabel>
        <NativeSelect
          id="category"
          aria-invalid={!!form.formState.errors.category}
          {...form.register('category')}
        >
          <option value="">{t('onboarding.pickCategory')}</option>
          {ORGANIZATION_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {t(`organizationCategory.${category}`)}
            </option>
          ))}
        </NativeSelect>
        <FormFieldError error={form.formState.errors.category} />
      </Field>
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
        {t('onboarding.button')}
      </Button>
    </form>
  );
}
