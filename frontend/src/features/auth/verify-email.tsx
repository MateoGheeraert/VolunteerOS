'use client';

import { CircleCheck, CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { IconBlob } from '@/components/layout/icon-blob';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

type Status = 'verifying' | 'done' | 'invalid';

/**
 * Opens the link from a verification or email change email: hands the token to Better Auth
 * once, then says whether it worked. Works with or without being signed in.
 */
export function VerifyEmail() {
  const t = useTranslations();
  const token = useSearchParams().get('token');
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'invalid');
  // A token is single-use for an email change: never send it twice (React runs effects twice
  // in development).
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    void authClient.verifyEmail({ query: { token } }).then(({ error }) => {
      setStatus(error ? 'invalid' : 'done');
    });
  }, [token]);

  if (status === 'verifying') {
    return <p className="text-center text-muted-foreground">{t('verifyEmail.verifying')}</p>;
  }
  const done = status === 'done';
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <IconBlob icon={done ? CircleCheck : CircleAlert} tone={done ? 'ok' : 'warn'} size="lg" />
      <h1 className="text-2xl">{t(done ? 'verifyEmail.doneTitle' : 'verifyEmail.invalidTitle')}</h1>
      <p className="text-muted-foreground">
        {t(done ? 'verifyEmail.doneBody' : 'verifyEmail.invalidBody')}
      </p>
      <Button asChild>
        <Link href="/settings/account">{t('verifyEmail.toSettings')}</Link>
      </Button>
    </div>
  );
}
