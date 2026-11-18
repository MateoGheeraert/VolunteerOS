'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import { cn } from '@/lib/utils';

type TabKey = 'profile' | 'account' | 'organization';

/** `segment` is the child route under /settings. */
const TABS: { key: TabKey; segment: string; soon?: boolean }[] = [
  { key: 'profile', segment: 'profile', soon: true },
  { key: 'account', segment: 'account', soon: true },
  { key: 'organization', segment: 'organization' },
];

/** Settings sections as tabs, styled like the event tabs. */
export function SettingsTabs() {
  const t = useTranslations();
  const active = useSelectedLayoutSegment();

  return (
    <nav
      aria-label={t('settingsTabs.label')}
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
                  {t(`settingsTabs.${tab.key}`)}
                </span>
              </li>
            );
          }
          const isActive = active === tab.segment;
          return (
            <li key={tab.key}>
              <Link
                href={`/settings/${tab.segment}`}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  className,
                  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground',
                )}
              >
                {t(`settingsTabs.${tab.key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
