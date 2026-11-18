'use client';

import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { InlineSelect, InlineText, InlineTextarea } from '@/components/inline-edit/inline-edit';
import type { MessageKey } from '@/i18n/keys';
import type { OrganizationProfile as Profile } from '@/server/auth';
import { updateOrganization } from '@/server/organizations/actions';
import {
  formatEnterpriseNumber,
  normalizeEnterpriseNumber,
  ORGANIZATION_CATEGORIES,
  ORGANIZATION_LEGAL_FORMS,
  organizationPatchSchema,
  parseYear,
  prefilledPeppolId,
  type OrganizationCategory,
  type OrganizationLegalForm,
  type OrganizationPatch,
} from './profile';

/** Saves one inline edit; resolves to whether it worked (a failure shows a toast). */
function useUpdateOrganization(organizationId: string) {
  const t = useTranslations();
  const router = useRouter();
  const { executeAsync } = useAction(updateOrganization.bind(null, organizationId));
  return async (patch: OrganizationPatch): Promise<boolean> => {
    // Checked here first, so a typo gets its own message instead of "check the fields".
    const checked = organizationPatchSchema.safeParse(patch);
    if (!checked.success) {
      toast.error(t((checked.error.issues[0]?.message ?? 'common.checkFields') as MessageKey));
      return false;
    }
    const result = await executeAsync(patch);
    if (!result || result.serverError || result.validationErrors) {
      toast.error(t(result?.serverError?.message ?? 'common.checkFields'));
      return false;
    }
    router.refresh();
    return true;
  };
}

/**
 * The organization's profile, edited in place: click a value and it becomes its input. Owners
 * and admins edit; members see the same values read-only (Better Auth refuses their updates).
 */
export function OrganizationProfileView({
  profile,
  editable,
}: {
  profile: Profile;
  editable: boolean;
}) {
  const t = useTranslations();
  const save = useUpdateOrganization(profile.id);
  const empty = (placeholder?: string) =>
    editable
      ? (placeholder ?? t('organizationSettings.add'))
      : t('organizationSettings.notFilledIn');

  /** A one-line text field that may be left empty. */
  const text = (
    field:
      | 'insurerName'
      | 'insurancePolicyNumber'
      | 'street'
      | 'houseNumber'
      | 'box'
      | 'postalCode'
      | 'city',
    maxLength: number,
  ) => (
    <Field label={t(`organizationSettings.fields.${field}`)}>
      <InlineText
        label={t(`organizationSettings.fields.${field}`)}
        value={profile[field] ?? ''}
        onSave={(value) => save({ [field]: value || null })}
        editable={editable}
        placeholder={empty()}
        maxLength={maxLength}
      />
    </Field>
  );

  const saveEnterpriseNumber = (value: string) => {
    const digits = value.trim() === '' ? null : normalizeEnterpriseNumber(value);
    // An invalid number is sent as typed, so validation names the problem.
    if (value.trim() !== '' && digits === null) return save({ enterpriseNumber: value });
    const peppolId = prefilledPeppolId(profile.peppolId, profile.enterpriseNumber, digits);
    return save({
      enterpriseNumber: digits,
      ...(peppolId !== profile.peppolId && { peppolId }),
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground">
        {editable
          ? t('organizationSettings.description', { organization: profile.name })
          : t('organizationSettings.readOnly')}
      </p>

      <Section title={t('organizationSettings.sections.general')}>
        <Field label={t('organizationSettings.fields.name')}>
          <InlineText
            label={t('organizationSettings.fields.name')}
            value={profile.name}
            onSave={(name) => save({ name })}
            editable={editable}
            required
            maxLength={100}
          />
        </Field>
        <Field label={t('organizationSettings.fields.category')}>
          <InlineSelect<OrganizationCategory>
            label={t('organizationSettings.fields.category')}
            value={profile.category}
            onSave={(category) => save({ category })}
            editable={editable}
            options={ORGANIZATION_CATEGORIES.map((value) => ({
              value,
              label: t(`organizationCategory.${value}`),
            }))}
            render={(value) => t(`organizationCategory.${value}`)}
          />
        </Field>
        <Field label={t('organizationSettings.fields.website')}>
          <InlineText
            label={t('organizationSettings.fields.website')}
            value={profile.website ?? ''}
            onSave={(website) => save({ website: website || null })}
            editable={editable}
            placeholder={empty(t('organizationSettings.placeholders.website'))}
            maxLength={200}
          />
        </Field>
        <Field label={t('organizationSettings.fields.foundingYear')}>
          <InlineText
            label={t('organizationSettings.fields.foundingYear')}
            value={profile.foundingYear?.toString() ?? ''}
            onSave={(year) => save({ foundingYear: parseYear(year) })}
            editable={editable}
            placeholder={empty()}
            maxLength={4}
          />
        </Field>
        <Field label={t('organizationSettings.fields.description')}>
          <InlineTextarea
            label={t('organizationSettings.fields.description')}
            value={profile.description ?? ''}
            onSave={(description) => save({ description: description || null })}
            editable={editable}
            placeholder={empty(t('organizationSettings.placeholders.description'))}
            maxLength={5000}
          />
        </Field>
      </Section>

      <Section title={t('organizationSettings.sections.legal')}>
        <Field label={t('organizationSettings.fields.legalForm')}>
          <InlineSelect<OrganizationLegalForm | ''>
            label={t('organizationSettings.fields.legalForm')}
            value={profile.legalForm ?? ''}
            onSave={(legalForm) => save({ legalForm: legalForm || null })}
            editable={editable}
            options={[
              { value: '', label: t('organizationSettings.notFilledIn') },
              ...ORGANIZATION_LEGAL_FORMS.map((value) => ({
                value,
                label: t(`organizationLegalForm.${value}`),
              })),
            ]}
            render={(value) =>
              value ? (
                t(`organizationLegalForm.${value}`)
              ) : (
                <span className="font-normal text-muted-foreground italic">{empty()}</span>
              )
            }
          />
        </Field>
        <Field
          label={t('organizationSettings.fields.enterpriseNumber')}
          hint={editable ? t('organizationSettings.hints.enterpriseNumber') : undefined}
        >
          <InlineText
            label={t('organizationSettings.fields.enterpriseNumber')}
            value={profile.enterpriseNumber ? formatEnterpriseNumber(profile.enterpriseNumber) : ''}
            onSave={saveEnterpriseNumber}
            editable={editable}
            placeholder={empty(t('organizationSettings.placeholders.enterpriseNumber'))}
            maxLength={30}
          />
        </Field>
        <Field
          label={t('organizationSettings.fields.peppolId')}
          hint={editable ? t('organizationSettings.hints.peppolId') : undefined}
        >
          <InlineText
            label={t('organizationSettings.fields.peppolId')}
            value={profile.peppolId ?? ''}
            onSave={(peppolId) => save({ peppolId: peppolId || null })}
            editable={editable}
            placeholder={empty(t('organizationSettings.placeholders.peppolId'))}
            maxLength={60}
          />
        </Field>
      </Section>

      <Section
        title={t('organizationSettings.sections.insurance')}
        description={t('organizationSettings.hints.insurance')}
      >
        <Field label={t('organizationSettings.fields.insurerName')}>
          <InlineText
            label={t('organizationSettings.fields.insurerName')}
            value={profile.insurerName ?? ''}
            onSave={(insurerName) => save({ insurerName: insurerName || null })}
            editable={editable}
            placeholder={empty(t('organizationSettings.placeholders.insurerName'))}
            maxLength={100}
          />
        </Field>
        {text('insurancePolicyNumber', 100)}
      </Section>

      <Section title={t('organizationSettings.sections.address')}>
        {text('street', 200)}
        {text('houseNumber', 20)}
        {text('box', 20)}
        {text('postalCode', 20)}
        {text('city', 100)}
        <Field
          label={t('organizationSettings.fields.country')}
          hint={editable ? t('organizationSettings.hints.country') : undefined}
        >
          <InlineText
            label={t('organizationSettings.fields.country')}
            value={profile.country}
            onSave={(country) => save({ country })}
            editable={editable}
            required
            maxLength={2}
            className="uppercase"
          />
        </Field>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-soft sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <dl className="grid gap-2 text-sm">{children}</dl>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-9 items-start gap-x-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <dt className="font-bold text-muted-foreground sm:py-2">{label}</dt>
      <dd className="min-w-0 font-semibold">
        {children}
        {hint && <p className="mt-1 text-xs font-normal text-muted-foreground">{hint}</p>}
      </dd>
    </div>
  );
}
