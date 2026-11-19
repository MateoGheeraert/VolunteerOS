import { CalendarDays, Lock, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { BrandLogo } from '@/components/layout/brand-logo';
import { IconBlob } from '@/components/layout/icon-blob';
import { Skeleton } from '@/components/ui/skeleton';
import { PublicRegistrationForm } from '@/features/registration/public-registration-form';
import { formatDateTime, formatEventRange } from '@/lib/format';
import { getPublicEvent } from '@/server/planning/queries';

export const metadata: Metadata = {
  title: 'Inschrijven als vrijwilliger',
  // A link meant for the people it was sent to, not for search engines.
  robots: { index: false, follow: false },
};

/**
 * The account-free sign-up page for volunteers (docs/info.md §7.5), mobile first: a colored
 * header with the event, and the form on a rounded sheet.
 */
export default function PublicRegistrationPage({ params }: PageProps<'/e/[slug]'>) {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <Suspense fallback={<PageSkeleton />}>
        <Registration params={params} />
      </Suspense>
    </main>
  );
}

async function Registration({ params }: Pick<PageProps<'/e/[slug]'>, 'params'>) {
  const { slug } = await params;
  const [event, t] = await Promise.all([getPublicEvent(slug), getTranslations()]);

  return (
    <>
      <header className="relative overflow-hidden bg-primary px-4 pt-6 pb-16 text-primary-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-16 size-64 rounded-full bg-brand-secondary/40"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-12 size-52 rounded-full bg-brand-accent/30"
        />
        <div className="relative mx-auto flex w-full max-w-xl flex-col gap-3">
          <span className="text-sm font-bold opacity-90">{event.organizationName}</span>
          <h1 className="text-3xl leading-tight font-extrabold">{event.name}</h1>
          <p className="flex flex-col gap-1 text-base opacity-95">
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="size-4" aria-hidden />
              {formatEventRange(event.startsAt, event.endsAt)}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-2">
                <MapPin className="size-4" aria-hidden />
                {event.location}
              </span>
            )}
          </p>
        </div>
      </header>
      <div className="relative mx-auto -mt-10 w-full max-w-xl px-3 pb-10">
        <div className="flex flex-col gap-6 rounded-3xl bg-card p-5 shadow-soft sm:p-7">
          {event.description && (
            <p className="whitespace-pre-wrap text-muted-foreground">{event.description}</p>
          )}
          {event.closedReason ? (
            <div className="flex flex-col items-start gap-3">
              <IconBlob icon={Lock} tone="warn" />
              <h2 className="text-xl">{t('register.closedTitle')}</h2>
              <p className="text-muted-foreground">{t(`register.closed.${event.closedReason}`)}</p>
            </div>
          ) : (
            <>
              {event.registrationDeadline && (
                <p className="rounded-xl bg-brand-tint px-3.5 py-2.5 text-sm font-semibold text-primary">
                  {t('register.deadline', { date: formatDateTime(event.registrationDeadline) })}
                </p>
              )}
              <PublicRegistrationForm slug={slug} event={event} />
            </>
          )}
        </div>
        <div className="mt-6 flex justify-center opacity-70">
          <BrandLogo />
        </div>
      </div>
    </>
  );
}

function PageSkeleton() {
  return (
    <>
      <div className="h-48 bg-primary" />
      <div className="mx-auto -mt-10 w-full max-w-xl px-3">
        <Skeleton className="h-[28rem] rounded-3xl bg-card" />
      </div>
    </>
  );
}
