import { Mail, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { telHref } from '@/features/suppliers/schemas';
import { FileCount, SupplierEntries, SupplierTotals } from '@/features/suppliers/supplier-usage';
import { listEventSuppliers } from '@/server/suppliers/queries';

export const metadata: Metadata = { title: 'Leveranciers' };

export default function EventSuppliersPage({ params }: PageProps<'/events/[eventId]/suppliers'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-3xl bg-card" />}>
      <EventSuppliers params={params} />
    </Suspense>
  );
}

/**
 * Who delivers for this event and what they cost, read from the budget: a supplier shows here
 * once a budget entry references it. Nothing is linked on this tab itself.
 */
async function EventSuppliers({
  params,
}: Pick<PageProps<'/events/[eventId]/suppliers'>, 'params'>) {
  const { eventId } = await params;
  const [suppliers, t] = await Promise.all([listEventSuppliers(eventId), getTranslations()]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t.rich('suppliers.eventTab.description', {
          budget: (chunks) => (
            <Link
              href={`/events/${eventId}/budget`}
              className="font-bold text-foreground underline-offset-4 hover:underline"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
      {suppliers.length === 0 ? (
        <p className="rounded-3xl bg-card p-8 text-center text-sm text-muted-foreground">
          {t('suppliers.eventTab.empty')}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {suppliers.map(({ supplier, entries }) => (
            <article key={supplier.id} className="flex flex-col gap-3 rounded-3xl bg-card p-5">
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/suppliers/${supplier.id}`}
                    className="min-w-0 truncate font-bold underline-offset-4 hover:underline"
                  >
                    {supplier.name}
                  </Link>
                  <Badge variant="secondary">{t(`supplierCategory.${supplier.category}`)}</Badge>
                  {supplier.archivedAt && (
                    <Badge variant="outline">{t('suppliers.archived')}</Badge>
                  )}
                </div>
                {(supplier.contactName || supplier.phone || supplier.email) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    {supplier.contactName && <span>{supplier.contactName}</span>}
                    {supplier.phone && (
                      <a
                        href={telHref(supplier.phone)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        <Phone className="size-3.5" aria-hidden />
                        {supplier.phone}
                      </a>
                    )}
                    {supplier.email && (
                      <a
                        href={`mailto:${supplier.email}`}
                        className="inline-flex min-w-0 items-center gap-1 hover:text-foreground"
                      >
                        <Mail className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{supplier.email}</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <SupplierTotals entries={entries} />
                <span className="text-sm text-muted-foreground">
                  {t('suppliers.entryCount', { count: entries.length })}
                </span>
                <FileCount entries={entries} />
              </div>
              <SupplierEntries entries={entries} />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
