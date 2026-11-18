'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

/** Moves the session on to another organization, or offers to create one when there is none. */
export function SwitchAfterRemoval({ nextOrganizationId }: { nextOrganizationId: string | null }) {
  const t = useTranslations();
  const router = useRouter();
  const switched = useRef(false);

  useEffect(() => {
    if (!nextOrganizationId || switched.current) return;
    switched.current = true;
    void (async () => {
      await authClient.organization.setActive({ organizationId: nextOrganizationId });
      toast.info(t('members.removedNotice'));
      router.replace('/events');
      router.refresh();
    })();
  }, [nextOrganizationId, router, t]);

  if (nextOrganizationId) {
    return <p className="font-semibold text-muted-foreground">{t('common.loading')}</p>;
  }
  return (
    <Button asChild size="lg" className="w-full">
      <Link href="/onboarding">{t('nav.newOrganization')}</Link>
    </Button>
  );
}
