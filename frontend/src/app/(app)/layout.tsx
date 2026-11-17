import { Suspense } from 'react';
import { requireActiveOrganization } from '@/server/auth';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { BrandLogo } from '@/components/layout/brand-logo';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { UserMenu } from '@/features/auth/user-menu';
import { OrganizationSwitcher } from '@/features/organizations/organization-switcher';

/**
 * The organizer app. The chrome is static; the session-dependent parts stream in behind Suspense.
 * The organization slot is also the real session check: no session → /login, no active
 * organization → /onboarding (proxy.ts only checked that a cookie exists).
 */
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <SidebarProvider>
      <AppSidebar
        organization={
          <Suspense fallback={<Skeleton className="h-15 w-full rounded-2xl bg-card" />}>
            <ActiveOrganization />
          </Suspense>
        }
        user={
          <Suspense fallback={<Skeleton className="h-12 w-full rounded-full bg-card" />}>
            <CurrentUser />
          </Suspense>
        }
      />
      <SidebarInset className="bg-background">
        <header className="flex items-center justify-between gap-3 px-4 pt-4 md:hidden">
          <BrandLogo />
          <SidebarTrigger className="size-11 rounded-full bg-card shadow-soft" />
        </header>
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

async function ActiveOrganization() {
  const { organization, organizations } = await requireActiveOrganization();
  return <OrganizationSwitcher active={organization} organizations={organizations} />;
}

async function CurrentUser() {
  const { user } = await requireActiveOrganization();
  return <UserMenu user={user} />;
}
