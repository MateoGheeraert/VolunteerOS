import { Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { MilaHint, MilaWorkingOnPlanning } from './mila-hint';
import { TeamCoverageChart } from './overview-charts';
import { Counts, EmptyState, OverviewCard, SegmentBar } from './overview-card';
import { coverageParts, hintFor, type OverviewCardProps } from './overview-types';

/**
 * Planning: how many places are filled (confirmed darker than proposed), how far the volunteers
 * got (applied → placed → still waiting), each team's coverage and whether the schedule went out.
 */
export async function PlanningCard({ eventId, overview, canManage, className }: OverviewCardProps) {
  const t = await getTranslations('overview.planning');
  const { planning, mila } = overview;
  const href = `/events/${eventId}/planning`;
  // Mila speaks here like in the task card (docs/info.md §7.7.1 D).
  const hint = hintFor(overview, 'planning');
  const milaHint = hint && (
    <MilaHint
      key={`${hint.key}:${hint.fingerprint}:${hint.highlighted}`}
      eventId={eventId}
      hint={hint}
      pendingTaskSuggestions={mila.pendingTaskSuggestions}
      pendingPlanningSuggestions={mila.pendingPlanningSuggestions}
    />
  );
  const working = mila.enabled && mila.planningBusy && <MilaWorkingOnPlanning />;
  const card = {
    title: t('title'),
    icon: Users,
    status: planning.status,
    href,
    viewLabel: t('view'),
    className,
  };

  const funnel = (
    <Counts
      items={[
        { key: 'applications', label: t('applications'), value: planning.applications },
        { key: 'assigned', label: t('assigned'), value: planning.assignedVolunteers },
        {
          key: 'unassigned',
          label: t('unassigned'),
          value: planning.unassignedVolunteers,
          tone: 'warn',
        },
      ]}
    />
  );

  const published = (
    <p className="text-xs text-muted-foreground">
      {planning.schedulePublishedAt
        ? t('published', { date: formatDate(new Date(planning.schedulePublishedAt)) })
        : t('notPublished')}
    </p>
  );

  // No shifts yet: an empty state, or (shifts mode) the volunteers waiting for them.
  const noPlaces = planning.volunteerCommitment === 'shifts' || planning.applications === 0;
  if (planning.shiftCount === 0 && noPlaces) {
    return (
      <OverviewCard {...card}>
        {working}
        {planning.applications > 0 ? (
          <>
            <p className="text-sm font-bold">{t('noShifts', { count: planning.applications })}</p>
            {funnel}
            {milaHint}
          </>
        ) : hint?.highlighted ? (
          milaHint
        ) : (
          <EmptyState
            title={t('emptyTitle')}
            body={overview.phase === 'after' ? t('emptyAfter') : t('emptyBody')}
            action={
              canManage &&
              overview.phase !== 'after' && (
                <Button asChild size="sm">
                  <Link href={href}>{t('emptyAction')}</Link>
                </Button>
              )
            }
          />
        )}
      </OverviewCard>
    );
  }

  // Whole-event volunteers fill no places: the headline is how many of them are placed.
  if (planning.volunteerCommitment === 'whole_event') {
    const headline = t('wholeEventHeadline', {
      assigned: planning.assignedVolunteers,
      applications: planning.applications,
    });
    return (
      <OverviewCard {...card}>
        {working}
        <div className="flex flex-col gap-2">
          <p className="text-lg font-extrabold">{headline}</p>
          <SegmentBar
            segments={[
              {
                key: 'assigned',
                label: t('assigned'),
                value: planning.assignedVolunteers,
                className: 'bg-status-ok',
              },
              {
                key: 'unassigned',
                label: t('unassigned'),
                value: planning.unassignedVolunteers,
                className: 'bg-muted',
              },
            ]}
          />
        </div>
        {published}
        {milaHint}
      </OverviewCard>
    );
  }

  const headline = t('headline', { filled: planning.filled, positions: planning.positions });
  const labels = { confirmed: t('confirmed'), proposed: t('proposed'), open: t('open') };
  const parts = coverageParts(planning);
  return (
    <OverviewCard {...card}>
      {working}
      <div className="flex flex-col gap-2">
        <p className="text-lg font-extrabold">{headline}</p>
        <SegmentBar
          segments={[
            // Filled is green (confirmed darker); the badge and icon carry the card's status.
            {
              key: 'confirmed',
              label: labels.confirmed,
              value: parts.confirmed,
              className: 'bg-status-ok',
            },
            {
              key: 'proposed',
              label: labels.proposed,
              value: parts.proposed,
              className: 'bg-status-ok opacity-45',
            },
            { key: 'open', label: labels.open, value: parts.open, className: 'bg-muted' },
          ]}
        />
      </div>

      {funnel}

      {planning.teams.length > 1 && <TeamCoverageChart teams={planning.teams} labels={labels} />}

      {published}
      {milaHint}
    </OverviewCard>
  );
}
