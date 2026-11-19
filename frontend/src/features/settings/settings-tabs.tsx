'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import { MilaAvatar } from '@/components/mila';
import { cn } from '@/lib/utils';

/** `segment` is the child route under /settings. */
const TABS = [
  { key: 'profile', segment: 'profile' },
  { key: 'account', segment: 'account' },
  { key: 'organization', segment: 'organization' },
  { key: 'ai', segment: 'ai', adminOnly: true },
] as const;

/**
 * Personal settings (profile, account) and the active organization's, as tabs. The Mila tab (what
 * the AI assistant remembers, in her colors) is for owners and admins.
 */
export function SettingsTabs({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations();
  const active = useSelectedLayoutSegment();

  return (
    <nav
      aria-label={t('settings.title')}
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
    >
      <ul className="flex w-max gap-1.5">
        {TABS.filter((tab) => isAdmin || !('adminOnly' in tab)).map((tab) => {
          const isActive = active === tab.segment;
          return (
            <li key={tab.key}>
              <Link
                href={`/settings/${tab.segment}`}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex h-10 items-center rounded-full px-4 text-sm font-bold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  isActive
                    ? tab.key === 'ai'
                      ? 'bg-mila-gradient text-white'
                      : 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground',
                )}
              >
                {tab.key === 'ai' && <MilaAvatar size="xs" className="mr-1.5 -ml-1.5" />}
                {t(`settings.tabs.${tab.key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
