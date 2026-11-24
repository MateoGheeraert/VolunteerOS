import { Paperclip } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { SupplierEntry } from '@/api/generated/types.gen';
import { FileTypeIcon } from '@/features/uploads/files-panel';
import { formatBytes, uploadHref } from '@/features/uploads/schemas';
import { formatCents } from '@/lib/money';
import { cn } from '@/lib/utils';
import { supplierTotals, type SupplierTotal } from './schemas';

/**
 * What a supplier cost and brought in over some budget entries: "Kost € 1.125,00", and
 * "Inkomst € 250,00" when it also sponsored. An estimate standing in for a missing actual amount
 * is marked.
 */
export async function SupplierTotals({
  entries,
  className,
}: {
  entries: SupplierEntry[];
  className?: string;
}) {
  const t = await getTranslations();
  const { expense, income } = supplierTotals(entries);
  const part = (label: string, total: SupplierTotal, tone: string) => (
    <span className="whitespace-nowrap">
      <span className="text-muted-foreground">{label} </span>
      <span className={cn('font-bold tabular-nums', tone)}>{formatCents(total.cents)}</span>
      {total.estimated && (
        <span className="text-muted-foreground"> ({t('suppliers.partlyEstimated')})</span>
      )}
    </span>
  );
  return (
    <span className={cn('flex flex-wrap gap-x-4 gap-y-1 text-sm', className)}>
      {expense && part(t('suppliers.cost'), expense, 'text-status-bad')}
      {income && part(t('suppliers.income'), income, 'text-status-ok')}
    </span>
  );
}

/**
 * The budget entries that reference the supplier, each with its amount and its files (most
 * likely the invoices). An entry opens in the event's budget; a file opens like everywhere else.
 */
export async function SupplierEntries({ entries }: { entries: SupplierEntry[] }) {
  const t = await getTranslations();
  return (
    <ul className="flex flex-col divide-y divide-border">
      {entries.map((entry) => {
        const isIncome = entry.type === 'income';
        const cents = entry.actualCents ?? entry.estimatedCents;
        return (
          <li key={entry.id} className="flex flex-col gap-2 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/events/${entry.eventId}/budget?entry=${entry.id}`}
                className="min-w-0 truncate text-sm font-bold underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="sr-only">
                  {isIncome ? t('budget.income') : t('budget.expenses')}:{' '}
                </span>
                {entry.title}
              </Link>
              <span className="flex shrink-0 flex-col items-end text-sm tabular-nums">
                <span className={isIncome ? 'text-status-ok' : 'text-status-bad'}>
                  {isIncome ? '+ ' : '− '}
                  {cents === null ? t('budget.noAmount') : formatCents(cents)}
                </span>
                {entry.actualCents === null && (
                  <span className="text-xs text-muted-foreground">{t('suppliers.estimated')}</span>
                )}
              </span>
            </div>
            {entry.files.length > 0 && (
              <ul className="flex flex-col gap-1">
                {entry.files.map((file) => (
                  <li key={file.id} className="flex min-w-0 items-center gap-2 text-sm">
                    <FileTypeIcon mimeType={file.mimeType} />
                    <a
                      href={uploadHref(entry.eventId, file.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate underline-offset-4 hover:underline"
                    >
                      {file.name}
                    </a>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatBytes(file.sizeBytes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** "2 facturen" next to an event or a supplier, when there are any. */
export async function FileCount({ entries }: { entries: SupplierEntry[] }) {
  const t = await getTranslations();
  const count = entries.reduce((sum, entry) => sum + entry.files.length, 0);
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <Paperclip className="size-3.5" aria-hidden />
      {t('budget.fileCount', { count })}
    </span>
  );
}
