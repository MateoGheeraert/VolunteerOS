'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import { cn } from '@/lib/utils';

/** `segment` is the child route under /settings. */
const TABS = [
  { key: 'profile', segment: 'profile' },
  { key: 'account', segment: 'account' },
  { key: 'organization', segment: 'organization' },
] as const;

/** Personal settings (profile, account) and the active organization's, as tabs. */
export function SettingsTabs() {
  const t = useTranslations();
  const active = useSelectedLayoutSegment();

  return (
    <nav
      aria-label={t('settings.title')}
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
    >
      <ul className="flex w-max gap-1.5">
        {TABS.map((tab) => {
          const isActive = active === tab.segment;
          return (
            <li key={tab.key}>
              <Link
                href={`/settings/${tab.segment}`}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex h-10 items-center rounded-full px-4 text-sm font-bold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground',
                )}
              >
                {t(`settings.tabs.${tab.key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
