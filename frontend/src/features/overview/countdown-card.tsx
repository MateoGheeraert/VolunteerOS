import { CalendarClock, ClipboardCheck, PartyPopper } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime, LOCALE } from '@/lib/format';
import { CountdownRing } from './overview-charts';
import { OverviewCard, Stat } from './overview-card';
import type { OverviewCardProps } from './overview-types';

const DAY_MS = 24 * 60 * 60 * 1000;
const count = new Intl.NumberFormat(LOCALE);

/**
 * The first card: days to go before the event, "Nu bezig" during it, and the wrap-up after it.
 * No status color: time passing isn't good or bad by itself.
 */
export async function CountdownCard({
  eventId,
  overview,
  canManage,
  className,
}: OverviewCardProps) {
  if (overview.phase === 'after') {
    return (
      <WrapUpCard
        eventId={eventId}
        overview={overview}
        canManage={canManage}
        className={className}
      />
    );
  }
  const t = await getTranslations('overview.countdown');
  const { countdown } = overview;

  if (overview.phase === 'during') {
    return (
      <OverviewCard
        title={t('liveTitle')}
        icon={PartyPopper}
        status="neutral"
        className={className}
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold">
            {t('liveUntil', { time: formatDateTime(countdown.endsAt) })}
          </p>
          <p className="text-sm text-muted-foreground">{t('liveDetail')}</p>
        </div>
      </OverviewCard>
    );
  }

  // The share of the time between creating the event and its start that has passed.
  const runUp = Date.parse(countdown.startsAt) - Date.parse(countdown.createdAt);
  const left = overview.daysToStart * DAY_MS;
  const elapsedPercent =
    runUp > 0 ? Math.round(Math.min(1, Math.max(0, (runUp - left) / runUp)) * 100) : 100;

  return (
    <OverviewCard title={t('title')} icon={CalendarClock} status="neutral" className={className}>
      <div className="flex items-center gap-4">
        <CountdownRing
          elapsedPercent={elapsedPercent}
          label={t('elapsed', { percent: elapsedPercent })}
        >
          <span className="flex flex-col leading-none">
            <span className="text-2xl font-extrabold tabular-nums text-primary">
              {count.format(overview.daysToStart)}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground">
              {t('daysUnit', { count: overview.daysToStart })}
            </span>
          </span>
        </CountdownRing>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-bold">{t('days', { count: overview.daysToStart })}</p>
          <p className="text-xs text-muted-foreground">
            {t('untilStart', { date: formatDate(new Date(countdown.startsAt)) })}
          </p>
        </div>
      </div>
      {countdown.milestones.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {countdown.milestones.map((milestone) => (
            <li key={milestone.kind} className="flex justify-between gap-3">
              <span className="font-bold">
                {t(milestone.kind === 'registration_closes' ? 'registrationCloses' : 'setupStarts')}
              </span>
              <span className="text-right text-muted-foreground">
                {formatDateTime(milestone.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}

/** After the event: how it went, what is left, and the terugblik for the next edition. */
async function WrapUpCard({ eventId, overview, canManage, className }: OverviewCardProps) {
  const t = await getTranslations('overview.wrapUp');
  const { expectedAttendance: expected, actualAttendance: actual, openTasks } = overview.wrapUp;
  const settings = `/events/${eventId}/settings`;

  return (
    <OverviewCard title={t('title')} icon={ClipboardCheck} status="neutral" className={className}>
      <div className="flex flex-col gap-2">
        {actual !== null ? (
          <Stat
            label={t('attendance')}
            value={
              expected !== null
                ? t('attendanceBoth', {
                    actual: count.format(actual),
                    expected: count.format(expected),
                  })
                : t('attendanceActual', { actual: count.format(actual) })
            }
          />
        ) : (
          <div className="flex flex-col items-start gap-2 rounded-card bg-muted/60 px-3 py-2">
            <span className="text-sm font-bold">{t('attendanceMissing')}</span>
            {canManage && (
              <Button asChild size="sm" variant="secondary">
                <Link href={settings}>{t('fillAttendance')}</Link>
              </Button>
            )}
          </div>
        )}
        <p className="text-sm font-bold">{t('openTasks', { count: openTasks })}</p>
      </div>
      {overview.wrapUp.hasRetrospective ? (
        <p className="text-sm text-muted-foreground">{t('retrospectiveDone')}</p>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">{t('retrospective')}</p>
          {canManage && (
            <Button asChild size="sm">
              <Link href={settings}>{t('writeRetrospective')}</Link>
            </Button>
          )}
        </div>
      )}
    </OverviewCard>
  );
}
