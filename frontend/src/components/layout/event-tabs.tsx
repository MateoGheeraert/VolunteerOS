'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import { cn } from '@/lib/utils';

type TabKey = 'overview' | 'tasks' | 'volunteers' | 'budget' | 'suppliers' | 'settings';

/** `segment` is the child route under /events/[eventId]; null is the overview page. */
const TABS: { key: TabKey; segment: string | null; soon?: boolean }[] = [
  { key: 'overview', segment: null },
  { key: 'tasks', segment: 'tasks' },
  { key: 'volunteers', segment: 'volunteers', soon: true },
  { key: 'budget', segment: 'budget', soon: true },
  { key: 'suppliers', segment: 'suppliers', soon: true },
  { key: 'settings', segment: 'settings' },
];

/** Event sections as tabs under the event header, so "which event am I in" stays visible. */
export function EventTabs({ eventId }: { eventId: string }) {
  const t = useTranslations();
  const active = useSelectedLayoutSegment();

  return (
    <nav
      aria-label={t('nav.events')}
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
    >
      <ul className="flex w-max gap-1.5">
        {TABS.map((tab) => {
          const className =
            'inline-flex h-10 items-center rounded-full px-4 text-sm font-bold whitespace-nowrap';
          if (tab.soon) {
            return (
              <li key={tab.key}>
                <span
                  className={cn(className, 'cursor-not-allowed text-muted-foreground/60')}
                  title={t('common.comingSoon')}
                  aria-disabled
                >
                  {t(`eventTabs.${tab.key}`)}
                </span>
              </li>
            );
          }
          const isActive = active === tab.segment;
          return (
            <li key={tab.key}>
              <Link
                href={tab.segment ? `/events/${eventId}/${tab.segment}` : `/events/${eventId}`}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  className,
                  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground',
                )}
              >
                {t(`eventTabs.${tab.key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
