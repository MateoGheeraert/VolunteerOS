'use client';

import { Check, ChevronsUpDown, List, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Event } from '@/api/generated/types.gen';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSidebar } from '@/components/ui/sidebar';
import { formatDate } from '@/lib/format';

type EventOption = Pick<Event, 'id' | 'name' | 'startsAt' | 'status'>;

/**
 * Sits at the top of the sidebar inside an event: shows which event you're in and switches to
 * another one, keeping the section you're on (budget stays budget).
 */
export function EventSwitcher({ events }: { events: EventOption[] }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const [, , currentId, section] = pathname.split('/');
  const current = events.find((event) => event.id === currentId);
  if (!current) return null;

  // Archived events stay out of the list, unless it's the one you're in.
  const options = events
    .filter((event) => event.status !== 'archived' || event.id === current.id)
    .toSorted((a, b) => b.startsAt.localeCompare(a.startsAt));

  function switchTo(eventId: string) {
    if (eventId === current?.id) return;
    setOpenMobile(false);
    router.push(section ? `/events/${eventId}/${section}` : `/events/${eventId}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center justify-between gap-2 rounded-card bg-card px-3.5 py-2.5 text-left shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-muted-foreground">
            {t('nav.event')}
          </span>
          <span className="block truncate font-bold">{current.name}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
      >
        <DropdownMenuLabel>{t('nav.switchEvent')}</DropdownMenuLabel>
        {options.map((event) => (
          <DropdownMenuItem key={event.id} onSelect={() => switchTo(event.id)}>
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{event.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatDate(new Date(event.startsAt))}
              </span>
            </span>
            {event.id === current.id && <Check className="ml-auto" aria-hidden />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/events" onClick={() => setOpenMobile(false)}>
            <List aria-hidden />
            {t('nav.allEvents')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/events/new" onClick={() => setOpenMobile(false)}>
            <Plus aria-hidden />
            {t('events.new')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
