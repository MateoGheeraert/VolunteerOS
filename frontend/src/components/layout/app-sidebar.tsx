'use client';

import { CalendarDays, Settings, ShoppingBag, Users, type LucideIcon } from 'lucide-react';
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

interface NavItem {
  key: 'events' | 'suppliers' | 'members' | 'settings';
  href: string;
  icon: LucideIcon;
  /** Shown but not clickable until the feature exists. */
  soon?: boolean;
}

const NAV: NavItem[] = [
  { key: 'events', href: '/events', icon: CalendarDays },
  { key: 'suppliers', href: '/suppliers', icon: ShoppingBag, soon: true },
  { key: 'members', href: '/members', icon: Users, soon: true },
  { key: 'settings', href: '/settings', icon: Settings, soon: true },
];

/** Organization-level navigation. The organization switcher and user menu stream in as slots. */
export function AppSidebar({ organization, user }: { organization: ReactNode; user: ReactNode }) {
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader className="gap-4 px-3 pt-5">
        <Link href="/events" className="px-2" onClick={() => setOpenMobile(false)}>
          <BrandLogo />
        </Link>
        {organization}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {/* The pathname is request data on dynamic routes, so it streams in. */}
            <Suspense fallback={<NavMenu pathname={null} />}>
              <CurrentNavMenu />
            </Suspense>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-3 pb-4">{user}</SidebarFooter>
    </Sidebar>
  );
}

function CurrentNavMenu() {
  return <NavMenu pathname={usePathname()} />;
}

function NavMenu({ pathname }: { pathname: string | null }) {
  const t = useTranslations();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenu className="gap-1">
      {NAV.map((item) => (
        <SidebarMenuItem key={item.key}>
          {item.soon ? (
            <SidebarMenuButton disabled className="h-11 rounded-full px-4 font-semibold">
              <item.icon />
              <span>{t(`nav.${item.key}`)}</span>
              <Badge variant="outline" className="ml-auto">
                {t('common.comingSoon')}
              </Badge>
            </SidebarMenuButton>
          ) : (
            <SidebarMenuButton
              asChild
              isActive={pathname?.startsWith(item.href) ?? false}
              className="h-11 rounded-full px-4 font-semibold data-[active=true]:font-bold data-[active=true]:shadow-soft"
            >
              <Link href={item.href} onClick={() => setOpenMobile(false)}>
                <item.icon />
                <span>{t(`nav.${item.key}`)}</span>
              </Link>
            </SidebarMenuButton>
          )}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
