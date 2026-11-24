'use client';

import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  Settings,
  ShoppingBag,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { BrandLogo } from './brand-logo';

type NavLabel =
  | `nav.${'events' | 'myTasks' | 'suppliers' | 'members' | 'settings'}`
  | `eventTabs.${'overview' | 'tasks' | 'planning' | 'files' | 'budget' | 'suppliers' | 'settings'}`;

interface NavItem {
  label: NavLabel;
  href: string;
  icon: LucideIcon;
  /** Matches only the exact href, not its children (an event's overview). */
  exact?: boolean;
  /** Shown but not clickable until the feature exists. */
  soon?: boolean;
}

const ORGANIZATION_NAV: NavItem[] = [
  { label: 'nav.events', href: '/events', icon: CalendarDays },
  { label: 'nav.myTasks', href: '/tasks', icon: ListChecks },
  { label: 'nav.suppliers', href: '/suppliers', icon: ShoppingBag },
  { label: 'nav.members', href: '/members', icon: Users },
  { label: 'nav.settings', href: '/settings', icon: Settings, soon: true },
];

function eventNav(eventId: string): NavItem[] {
  const base = `/events/${eventId}`;
  return [
    { label: 'eventTabs.overview', href: base, icon: LayoutDashboard, exact: true },
    { label: 'eventTabs.tasks', href: `${base}/tasks`, icon: ListChecks },
    { label: 'eventTabs.planning', href: `${base}/planning`, icon: CalendarClock },
    { label: 'eventTabs.files', href: `${base}/files`, icon: FolderOpen },
    { label: 'eventTabs.budget', href: `${base}/budget`, icon: Wallet },
    { label: 'eventTabs.suppliers', href: `${base}/suppliers`, icon: ShoppingBag },
    { label: 'eventTabs.settings', href: `${base}/settings`, icon: Settings },
  ];
}

/** The event a pathname is inside, if any. `/events/new` is the create page, not an event. */
function eventIdFrom(pathname: string | null): string | null {
  const id = pathname?.match(/^\/events\/([^/]+)/)?.[1];
  return id && id !== 'new' ? id : null;
}

/**
 * Organization-level navigation, or an event's switcher and sections while inside that event. The
 * event switcher and the user menu (which also switches organizations) stream in as slots.
 */
export function AppSidebar({ eventSwitcher, user }: { eventSwitcher: ReactNode; user: ReactNode }) {
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader className="px-3 pt-5">
        <Link href="/events" className="px-2" onClick={() => setOpenMobile(false)}>
          <BrandLogo />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {/* The pathname is request data on dynamic routes, so it streams in. */}
            <Suspense fallback={<NavMenu pathname={null} eventSwitcher={null} />}>
              <CurrentNavMenu eventSwitcher={eventSwitcher} />
            </Suspense>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-3 pb-4">{user}</SidebarFooter>
    </Sidebar>
  );
}

function CurrentNavMenu({ eventSwitcher }: { eventSwitcher: ReactNode }) {
  return <NavMenu pathname={usePathname()} eventSwitcher={eventSwitcher} />;
}

function NavMenu({
  pathname,
  eventSwitcher,
}: {
  pathname: string | null;
  eventSwitcher: ReactNode;
}) {
  const t = useTranslations();
  const { setOpenMobile } = useSidebar();
  const eventId = eventIdFrom(pathname);
  const items = eventId ? eventNav(eventId) : ORGANIZATION_NAV;

  return (
    <div className="flex flex-col gap-3">
      {eventId && (
        <Link
          href="/events"
          onClick={() => setOpenMobile(false)}
          className="inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-1 text-sm font-bold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('nav.events')}
        </Link>
      )}
      {eventId && <div className="px-1 pb-1">{eventSwitcher}</div>}
      <SidebarMenu className="gap-1">
        {items.map((item) => (
          <SidebarMenuItem key={item.href}>
            {item.soon ? (
              <SidebarMenuButton disabled className="h-11 rounded-card px-4 font-semibold">
                <item.icon />
                <span>{t(item.label)}</span>
                <Badge variant="outline" className="ml-auto">
                  {t('common.comingSoon')}
                </Badge>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton
                asChild
                isActive={isActive(pathname, item)}
                className="h-11 rounded-card px-4 font-semibold data-[active=true]:font-bold data-[active=true]:shadow-soft"
              >
                <Link href={item.href} onClick={() => setOpenMobile(false)}>
                  <item.icon />
                  <span>{t(item.label)}</span>
                </Link>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </div>
  );
}

function isActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
