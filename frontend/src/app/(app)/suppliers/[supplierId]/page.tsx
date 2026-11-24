import { ArrowLeft, Globe, Mail, Phone, User } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Suspense } from 'react';
import type { Supplier } from '@/api/generated/types.gen';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { isOrgAdmin } from '@/features/members/permissions';
import { SupplierActions } from '@/features/suppliers/supplier-actions';
import { telHref } from '@/features/suppliers/schemas';
import { FileCount, SupplierEntries, SupplierTotals } from '@/features/suppliers/supplier-usage';
import { formatLongDay, utcIsoToBrussels } from '@/lib/format';
import { getActiveMember } from '@/server/auth';
import { getSupplier } from '@/server/suppliers/queries';

export async function generateMetadata({
  params,
}: PageProps<'/suppliers/[supplierId]'>): Promise<Metadata> {
  const { supplierId } = await params;
  const { supplier } = await getSupplier(supplierId);
  return { title: supplier.name };
}

export default function SupplierPage({ params }: PageProps<'/suppliers/[supplierId]'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96 max-w-4xl rounded-card bg-card" />}>
      <SupplierDetail params={params} />
    </Suspense>
  );
}

/**
 * One supplier: how to reach them, and every event whose budget used them, newest first, with
 * what it cost and the invoices. Every member edits; admins archive.
 */
async function SupplierDetail({ params }: Pick<PageProps<'/suppliers/[supplierId]'>, 'params'>) {
  const { supplierId } = await params;
  const [{ supplier, events }, me, t] = await Promise.all([
    getSupplier(supplierId),
    getActiveMember(),
    getTranslations(),
  ]);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link
            href="/suppliers"
            className="inline-flex w-fit items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t('suppliers.title')}
          </Link>
        }
        title={supplier.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t(`supplierCategory.${supplier.category}`)}</Badge>
            {supplier.archivedAt && <Badge variant="outline">{t('suppliers.archived')}</Badge>}
          </span>
        }
        actions={<SupplierActions supplier={supplier} canArchive={isOrgAdmin(me.role)} />}
      />

      <ContactCard supplier={supplier} />

      <section aria-labelledby="supplier-usage" className="flex flex-col gap-3">
        <h2 id="supplier-usage" className="text-lg">
          {t('suppliers.usage')}
        </h2>
        {events.length === 0 ? (
          <p className="rounded-card bg-card p-5 text-sm text-muted-foreground">
            {t('suppliers.usageEmpty')}
          </p>
        ) : (
          events.map(({ event, entries }) => (
            <article key={event.id} className="flex flex-col gap-2 rounded-card bg-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="flex min-w-0 flex-col">
                  <Link
                    href={`/events/${event.id}/budget`}
                    className="truncate font-bold underline-offset-4 hover:underline"
                  >
                    {event.name}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {formatLongDay(utcIsoToBrussels(event.startsAt).date)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <SupplierTotals entries={entries} />
                  <FileCount entries={entries} />
                </div>
              </div>
              <SupplierEntries entries={entries} />
            </article>
          ))
        )}
      </section>
    </div>
  );
}

async function ContactCard({ supplier }: { supplier: Supplier }) {
  const t = await getTranslations();
  const rows = [
    supplier.contactName && {
      icon: User,
      label: t('suppliers.form.contactName'),
      value: supplier.contactName,
    },
    supplier.phone && {
      icon: Phone,
      label: t('suppliers.form.phone'),
      value: supplier.phone,
      href: telHref(supplier.phone),
    },
    supplier.email && {
      icon: Mail,
      label: t('suppliers.form.email'),
      value: supplier.email,
      href: `mailto:${supplier.email}`,
    },
    supplier.website && {
      icon: Globe,
      label: t('suppliers.form.website'),
      value: supplier.website.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      href: supplier.website,
      external: true,
    },
  ].filter((row) => !!row);

  return (
    <section
      aria-label={t('suppliers.contact')}
      className="flex flex-col gap-4 rounded-card bg-card p-5"
    >
      {rows.length === 0 && !supplier.notes ? (
        <p className="text-sm text-muted-foreground">{t('suppliers.noContact')}</p>
      ) : (
        <>
          {rows.length > 0 && (
            <dl className="grid gap-3 sm:grid-cols-2">
              {rows.map((row) => (
                <div key={row.label} className="flex min-w-0 items-center gap-3">
                  <row.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <dt className="sr-only">{row.label}</dt>
                  <dd className="min-w-0 truncate text-sm">
                    {'href' in row && row.href ? (
                      <a
                        href={row.href}
                        className="font-semibold underline-offset-4 hover:underline"
                        {...('external' in row && row.external
                          ? { target: '_blank', rel: 'noopener noreferrer' }
                          : {})}
                      >
                        {row.value}
                      </a>
                    ) : (
                      row.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {supplier.notes && (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{supplier.notes}</p>
          )}
        </>
      )}
    </section>
  );
}
