'use client';

import { Check, ChevronsUpDown, Plus, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { OrganizationSummary } from '@/server/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/lib/auth-client';

export function OrganizationSwitcher({
  active,
  organizations,
}: {
  active: OrganizationSummary;
  organizations: OrganizationSummary[];
}) {
  const t = useTranslations();
  const router = useRouter();

  async function switchTo(organizationId: string) {
    if (organizationId === active.id) return;
    await authClient.organization.setActive({ organizationId });
    router.push('/events');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center justify-between gap-2 rounded-2xl bg-card px-3.5 py-2.5 text-left shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-muted-foreground">
            {t('nav.organization')}
          </span>
          <span className="block truncate font-bold">{active.name}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
      >
        <DropdownMenuLabel>{t('nav.switchOrganization')}</DropdownMenuLabel>
        {organizations.map((organization) => (
          <DropdownMenuItem key={organization.id} onSelect={() => void switchTo(organization.id)}>
            <span className="truncate">{organization.name}</span>
            {organization.id === active.id && <Check className="ml-auto" aria-hidden />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/organization">
            <Settings aria-hidden />
            {t('nav.organizationSettings')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus aria-hidden />
            {t('nav.newOrganization')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
