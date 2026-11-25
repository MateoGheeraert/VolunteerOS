'use client';

import {
  Cake,
  MapPin,
  PencilLine,
  Ticket,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { PromotionState } from '@/api/generated/types.gen';
import { IconBlob } from '@/components/layout/icon-blob';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCents } from '@/lib/money';
import { AudienceForm } from './audience-form';
import { audienceToForm } from './schemas';

/**
 * The Publiek at the bottom of the Promotie tab, in one line once filled in: who the event is
 * for, how many come, the entry and the promotion budget. The pitch and descriptions live in the
 * dialog. Managers edit it there; `?publiek=open` (from settings or Mila) opens it.
 */
export function AudienceCard({
  eventId,
  state,
  expectedAttendance,
  canEdit,
}: {
  eventId: string;
  state: PromotionState;
  expectedAttendance: number | null;
  canEdit: boolean;
}) {
  const t = useTranslations('promotion');
  const [openedHere, setOpenedHere] = useState(false);
  // `?publiek=open` (settings, Mila's warnings) opens the dialog, also when already on the tab;
  // closing it takes the parameter away again.
  const router = useRouter();
  const pathname = usePathname();
  const requested = useSearchParams().get('publiek') === 'open';
  const open = canEdit && (openedHere || requested);
  const setOpen = (next: boolean) => {
    setOpenedHere(next);
    if (!next && requested) router.replace(pathname, { scroll: false });
  };
  const { audience, budget } = state;
  const empty = audience.audiences.length === 0;
  const entry =
    audience.entryPriceCents === null
      ? null
      : audience.entryPriceCents === 0
        ? t('audience.free')
        : formatCents(audience.entryPriceCents);
  const ages =
    audience.ageMin !== null || audience.ageMax !== null
      ? t('audience.ageRange', { min: audience.ageMin ?? '?', max: audience.ageMax ?? '?' })
      : null;

  return (
    <section
      id="publiek"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card bg-card px-5 py-4 shadow-soft"
    >
      <div className="flex items-center gap-2.5">
        <IconBlob icon={Users} tone="brand" className="size-8 [&>svg]:size-4" />
        <h2 className="text-base">{t('audience.title')}</h2>
      </div>

      {empty ? (
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{t('audience.emptyShort')}</p>
      ) : (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <ul className="flex flex-wrap gap-1">
            {audience.audiences.map((option) => (
              <li
                key={option}
                className="rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-bold text-primary"
              >
                {t(`audienceOption.${option}`)}
              </li>
            ))}
          </ul>
          {expectedAttendance !== null && (
            <Fact icon={UsersRound} label={t('audience.expected')}>
              {t('audience.visitors', { count: expectedAttendance })}
              {state.sizeBand && <span className="text-muted-foreground"> · {state.sizeBand}</span>}
            </Fact>
          )}
          {entry && (
            <Fact icon={Ticket} label={t('audience.entry')}>
              {entry}
            </Fact>
          )}
          <Fact icon={Wallet} label={t('audience.budget')}>
            {budget.budgetCents === null
              ? t('audience.noBudgetShort')
              : t('audience.budgetShort', {
                  available: formatCents(budget.availableCents ?? 0),
                  budget: formatCents(budget.budgetCents),
                })}
          </Fact>
          {ages && (
            <Fact icon={Cake} label={t('audience.ages')}>
              {ages}
            </Fact>
          )}
          {audience.region && (
            <Fact icon={MapPin} label={t('audience.region')}>
              {audience.region}
            </Fact>
          )}
        </div>
      )}

      {canEdit && (
        <Button
          variant={empty ? 'default' : 'ghost'}
          size="sm"
          className="ml-auto"
          onClick={() => setOpen(true)}
        >
          <PencilLine aria-hidden />
          {empty ? t('audience.fill') : t('audience.editShort')}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{t('audience.title')}</DialogTitle>
            <DialogDescription>{t('audience.subtitle')}</DialogDescription>
          </DialogHeader>
          {open && (
            <AudienceForm
              eventId={eventId}
              defaultValues={audienceToForm(audience)}
              onDone={() => setOpen(false)}
              onCancel={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** One fact of the Publiek in the summary line: an icon, with the label for screen readers. */
function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5 font-semibold">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <span className="sr-only">{label}: </span>
      {children}
    </span>
  );
}
