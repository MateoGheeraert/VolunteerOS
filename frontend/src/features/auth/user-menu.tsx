'use client';

import { LogOut, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/server/auth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/lib/auth-client';
import { initials } from '@/lib/initials';

/** `profileIncomplete` marks the menu with a dot, nudging toward the profile settings. */
export function UserMenu({
  user,
  profileIncomplete = false,
}: {
  user: SessionUser;
  profileIncomplete?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();

  async function logout() {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-full p-1.5 pr-3 text-left outline-none hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="relative">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary font-bold text-primary-foreground">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          {profileIncomplete && (
            <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-background bg-brand-accent">
              <span className="sr-only">{t('settings.profile.nudgeTitle')}</span>
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-56">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">
            <Settings aria-hidden />
            <span className="flex flex-col">
              {t('nav.settings')}
              {profileIncomplete && (
                <span className="text-xs text-muted-foreground">
                  {t('settings.profile.nudgeTitle')}
                </span>
              )}
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut aria-hidden />
          {t('auth.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
