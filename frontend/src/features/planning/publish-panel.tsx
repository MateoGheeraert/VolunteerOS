'use client';

import { CircleAlert, CircleCheck, MailCheck, Phone, Send } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { Planning, PublishResult } from '@/api/generated/types.gen';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatShiftTime, formatShortDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  confirmAllAssignments,
  loadSchedulePreview,
  publishSchedule,
} from '@/server/planning/actions';
import { publishReadiness, shiftDay } from './planning-rules';

/**
 * Sending the schedule, once. First the facts (open places, unconfirmed proposals, volunteers
 * without a shift), then the organizer states everyone is assigned and nothing will change; only
 * then can they send. Later changes are told per volunteer, from the board.
 */
export function PublishPanel({
  eventId,
  planning,
  onDone,
}: {
  eventId: string;
  planning: Planning;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [includeNotNeeded, setIncludeNotNeeded] = useState(true);
  const [final, setFinal] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const preview = useAction(loadSchedulePreview.bind(null, eventId));
  const confirmAll = useAction(confirmAllAssignments.bind(null, eventId), {
    onSuccess: ({ data }) => {
      toast.success(t('planning.board.confirmedAll', { count: data?.confirmed ?? 0 }));
      preview.execute();
    },
    onError: ({ error }) => toast.error(t(error.serverError?.message ?? 'common.genericError')),
  });
  const publish = useAction(publishSchedule.bind(null, eventId), {
    onSuccess: ({ data }) => {
      if (!data) return;
      setResult(data);
      if (data.failed.length === 0) toast.success(t('planning.publish.done', { count: data.sent }));
    },
  });

  // Load what would be sent when the panel opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => preview.execute(), []);

  if (result) return <Result result={result} onDone={onDone} />;

  const data = preview.result.data;
  if (!data) {
    return preview.result.serverError ? (
      <FormError message={preview.result.serverError.message} />
    ) : (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16 rounded-card" />
        <Skeleton className="h-32 rounded-card" />
      </div>
    );
  }

  const { openSpots } = publishReadiness(planning);
  const proposed = data.proposedCount;
  const unplaced = planning.applications.filter((a) => a.assignments.length === 0).length;
  const chosen = data.recipients.filter((r) => includeNotNeeded || r.kind !== 'not_needed');
  const withEmail = chosen.filter((r) => r.email);
  const scheduled = data.recipients.filter((r) => r.kind === 'schedule');
  const withoutEmail = scheduled.filter((r) => !r.email);
  const notNeeded = data.recipients.filter((r) => r.kind === 'not_needed').length;
  const allGood = openSpots === 0 && proposed === 0;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-bold">{t('planning.publish.factsTitle')}</h3>
        <ul className="flex flex-col gap-1.5 text-sm">
          <Fact ok={openSpots === 0}>
            {openSpots === 0
              ? t('planning.publish.factNoOpenSpots')
              : t('planning.publish.checkOpenSpots', { count: openSpots })}
          </Fact>
          <Fact
            ok={proposed === 0}
            action={
              proposed > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={confirmAll.isPending}
                  onClick={() => confirmAll.execute()}
                >
                  {t('planning.board.confirmAll')}
                </Button>
              )
            }
          >
            {proposed === 0
              ? t('planning.publish.factAllConfirmed')
              : t('planning.publish.checkProposed', { count: proposed })}
          </Fact>
          {unplaced > 0 && (
            <Fact ok={null}>{t('planning.publish.factUnplaced', { count: unplaced })}</Fact>
          )}
        </ul>
        {!allGood && proposed === 0 && (
          <p className="text-sm text-muted-foreground">{t('planning.publish.factsHint')}</p>
        )}
      </section>

      {scheduled.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold">
            {t('planning.publish.kinds.schedule', { count: scheduled.length })}
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {scheduled.map((r) => (
              <li key={r.applicationId} className="rounded-full bg-muted px-2.5 py-1 text-sm">
                {r.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {notNeeded > 0 && (
        <label className="flex items-start gap-3 rounded-xl bg-muted/60 px-3.5 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-primary"
            checked={includeNotNeeded}
            onChange={(e) => setIncludeNotNeeded(e.target.checked)}
          />
          <span>{t('planning.publish.includeNotNeeded', { count: notNeeded })}</span>
        </label>
      )}

      {withoutEmail.length > 0 && (
        <section className="flex flex-col gap-2 rounded-card border-2 border-status-warn-bg p-3">
          <h3 className="text-sm font-bold">
            {t('planning.publish.withoutEmail', { count: withoutEmail.length })}
          </h3>
          <ul className="flex flex-col gap-2 text-sm">
            {withoutEmail.map((r) => (
              <li key={r.applicationId} className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-bold">
                  {r.name}
                  {r.phone && (
                    <a
                      href={`tel:${r.phone}`}
                      className="inline-flex items-center gap-1 font-semibold text-primary"
                    >
                      <Phone className="size-3.5" aria-hidden />
                      {r.phone}
                    </a>
                  )}
                </span>
                {r.shifts.map((s) => (
                  <span key={s.shiftId} className="text-muted-foreground">
                    {s.teamName} · {formatShortDay(shiftDay(s))}{' '}
                    {formatShiftTime(s.startsAt, s.endsAt)}
                    {s.meetingPoint && ` · ${s.meetingPoint}`}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      <label
        aria-label={t('planning.publish.finalCheck')}
        className={cn(
          'flex items-start gap-3 rounded-2xl border-2 px-4 py-3.5',
          final ? 'border-primary bg-brand-tint' : 'border-input',
          proposed > 0 && 'opacity-50',
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-primary"
          checked={final}
          disabled={proposed > 0}
          onChange={(e) => setFinal(e.target.checked)}
        />
        <span className="flex flex-col gap-1">
          <span className="font-bold">{t('planning.publish.finalCheck')}</span>
          <span className="text-sm text-muted-foreground">{t('planning.publish.onlyOnce')}</span>
        </span>
      </label>
      {proposed > 0 && (
        <p className="-mt-3 text-sm text-status-warn">{t('planning.publish.confirmFirst')}</p>
      )}

      <FormError message={publish.result.serverError?.message} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={!final || proposed > 0 || publish.isPending || chosen.length === 0}
          onClick={() => publish.execute({ includeNotNeeded, scheduleFinal: true })}
        >
          <Send data-icon="inline-start" aria-hidden />
          {t('planning.publish.sendFinal', { count: withEmail.length })}
        </Button>
      </div>
    </div>
  );
}

function Fact({
  ok,
  action,
  children,
}: {
  /** true: in order, false: needs attention, null: just so you know. */
  ok: boolean | null;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="flex items-center gap-2">
        {ok ? (
          <CircleCheck className="size-4 shrink-0 text-status-ok" aria-hidden />
        ) : (
          <CircleAlert
            className={cn(
              'size-4 shrink-0',
              ok === false ? 'text-status-warn' : 'text-muted-foreground',
            )}
            aria-hidden
          />
        )}
        {children}
      </span>
      {action}
    </li>
  );
}

function Result({ result, onDone }: { result: PublishResult; onDone: () => void }) {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-4">
      <output className="flex flex-col gap-2 rounded-card bg-brand-tint px-4 py-3 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <MailCheck className="size-4" aria-hidden />
          {t('planning.publish.result', { sent: result.sent, failed: result.failed.length })}
        </span>
        {result.failed.length > 0 && (
          <span className="text-status-bad">
            {t('planning.publish.failedLater', {
              names: result.failed.map((f) => f.name).join(', '),
            })}
          </span>
        )}
      </output>
      <p className="text-sm text-muted-foreground">{t('planning.publish.afterSend')}</p>
      <div className="flex justify-end">
        <Button onClick={onDone}>{t('planning.publish.close')}</Button>
      </div>
    </div>
  );
}
