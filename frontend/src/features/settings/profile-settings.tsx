'use client';

import { Info, Sparkles } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import type { MyProfile } from '@/api/generated/types.gen';
import { InlineDate, InlineText } from '@/components/inline-edit/inline-edit';
import { formatLongDay } from '@/lib/format';
import { patchProfile } from '@/server/profile/actions';
import { AddressField } from './address-field';
import { formatPhone, isTooYoung, isValidPhone, missingProfileFields } from './profile-rules';
import type { ProfilePatch } from './schemas';

/** Saves one inline edit; resolves to whether it worked (a failure shows a toast). */
function usePatchProfile() {
  const t = useTranslations();
  const router = useRouter();
  const { executeAsync } = useAction(patchProfile);
  return async (patch: ProfilePatch): Promise<boolean> => {
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
 * The user's name and personal details, edited in place. Everything but the name is optional;
 * a card on top asks for what is still missing.
 */
export function ProfileSettings({ profile, today }: { profile: MyProfile; today: string }) {
  const t = useTranslations();
  const patch = usePatchProfile();
  const missing = missingProfileFields(profile);

  const savePhone = async (value: string) => {
    if (value === '') return patch({ phone: null });
    if (!isValidPhone(value)) {
      toast.error(t('settings.profile.invalidPhone'));
      return false;
    }
    return patch({ phone: value });
  };
  const saveBirthDate = async (value: string | null) => {
    if (value && isTooYoung(value, today)) {
      toast.error(t('settings.profile.tooYoung'));
      return false;
    }
    return patch({ birthDate: value });
  };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      {missing.length > 0 && (
        <section className="flex items-start gap-3 rounded-card bg-brand-tint p-5 text-sm sm:px-8">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="font-bold">{t('settings.profile.nudgeTitle')}</p>
            <p className="text-muted-foreground">
              {t('settings.profile.nudgeBody', {
                fields: missing.map((field) => t(`settings.profile.fields.${field}`)).join(', '),
              })}
            </p>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-soft sm:p-8">
        <h2 className="text-lg">{t('settings.profile.title')}</h2>
        <dl className="grid gap-4 text-sm">
          <Detail label={t('settings.profile.fields.name')}>
            <InlineText
              label={t('settings.profile.fields.name')}
              value={profile.name}
              onSave={(name) => patch({ name })}
              required
              maxLength={100}
            />
          </Detail>
          <Detail label={t('settings.profile.fields.phone')} hint={t('settings.profile.phoneHint')}>
            <InlineText
              label={t('settings.profile.fields.phone')}
              value={profile.phone ? formatPhone(profile.phone) : ''}
              onSave={savePhone}
              placeholder={t('settings.profile.phonePlaceholder')}
              maxLength={30}
            />
          </Detail>
          <Detail
            label={t('settings.profile.fields.address')}
            why={t('settings.profile.addressWhy')}
          >
            <AddressField address={profile.address} />
          </Detail>
          <Detail
            label={t('settings.profile.fields.birthDate')}
            why={t('settings.profile.birthDateWhy')}
          >
            <InlineDate
              label={t('settings.profile.fields.birthDate')}
              value={profile.birthDate}
              onSave={saveBirthDate}
              placeholder={t('settings.profile.birthDatePlaceholder')}
              format={formatLongDay}
            />
          </Detail>
        </dl>
      </section>
    </div>
  );
}

/** A labelled row. `hint` explains the format; `why` says why we ask for it. */
function Detail({
  label,
  hint,
  why,
  children,
}: {
  label: string;
  hint?: string;
  why?: string;
  children: ReactNode;
}) {
  const t = useTranslations();
  return (
    <div className="grid items-start gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="font-bold text-muted-foreground sm:py-2">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-1.5 font-semibold">
        {children}
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
        {why && (
          <span className="flex items-start gap-1.5 text-xs font-normal text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">{t('settings.profile.whyTitle')}</span> {why}
            </span>
          </span>
        )}
      </dd>
    </div>
  );
}
