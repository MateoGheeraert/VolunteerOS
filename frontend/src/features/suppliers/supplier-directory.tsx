'use client';

import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SupplierListItem } from '@/api/generated/types.gen';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { formatLongDay, utcIsoToBrussels } from '@/lib/format';
import { NewSupplierDialog } from './new-supplier-dialog';
import {
  filterSuppliers,
  NO_SUPPLIER_FILTERS,
  SUPPLIER_CATEGORIES,
  type SupplierFilters,
} from './schemas';

/**
 * The organization's suppliers: search by name, contact or email, filter by category, and show
 * the archived ones on demand. Every member adds suppliers; a new one opens on its own page.
 */
export function SupplierDirectory({ suppliers }: { suppliers: SupplierListItem[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [filters, setFilters] = useState<SupplierFilters>(NO_SUPPLIER_FILTERS);
  const [creating, setCreating] = useState(false);
  const shown = filterSuppliers(suppliers, filters);
  const archivedCount = suppliers.filter((supplier) => supplier.archivedAt).length;
  const active = suppliers.length - archivedCount;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={t('suppliers.title')}
        description={t('suppliers.description')}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus data-icon="inline-start" aria-hidden />
            {t('suppliers.new')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label={t('suppliers.search')}
            placeholder={t('suppliers.searchPlaceholder')}
            value={filters.search}
            className="h-9 bg-card pl-9"
            onChange={(event) => setFilters((f) => ({ ...f, search: event.target.value }))}
          />
        </div>
        <div className="w-full sm:w-52">
          <NativeSelect
            aria-label={t('suppliers.category')}
            value={filters.category}
            className="h-9 bg-card"
            onChange={(event) =>
              setFilters((f) => ({
                ...f,
                category: event.target.value as SupplierFilters['category'],
              }))
            }
          >
            <option value="all">{t('suppliers.allCategories')}</option>
            {SUPPLIER_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {t(`supplierCategory.${value}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        {archivedCount > 0 && (
          <label className="flex h-9 cursor-pointer items-center gap-2 px-1 text-sm font-semibold">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={filters.showArchived}
              onChange={(event) =>
                setFilters((f) => ({ ...f, showArchived: event.target.checked }))
              }
            />
            {t('suppliers.showArchived', { count: archivedCount })}
          </label>
        )}
      </div>

      <section aria-label={t('suppliers.title')} className="rounded-3xl bg-card p-2 sm:p-3">
        {shown.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {active === 0 && !filters.showArchived
              ? t('suppliers.empty')
              : t('suppliers.emptyFiltered')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((supplier) => (
              <SupplierRow key={supplier.id} supplier={supplier} />
            ))}
          </ul>
        )}
      </section>

      <NewSupplierDialog
        open={creating}
        onOpenChange={setCreating}
        initialName={filters.search.trim()}
        onCreated={(supplier) => router.push(`/suppliers/${supplier.id}`)}
      />
    </div>
  );
}

function SupplierRow({ supplier }: { supplier: SupplierListItem }) {
  const t = useTranslations();
  const contact = [supplier.contactName, supplier.phone, supplier.email].filter(Boolean);
  return (
    <li className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={`/suppliers/${supplier.id}`}
            className="truncate font-bold underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {supplier.name}
          </Link>
          {supplier.archivedAt && <Badge variant="outline">{t('suppliers.archived')}</Badge>}
        </span>
        {contact.length > 0 && (
          <span className="truncate text-sm text-muted-foreground">{contact.join(' · ')}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:justify-end">
        <Badge variant="secondary">{t(`supplierCategory.${supplier.category}`)}</Badge>
        <span className="text-muted-foreground sm:w-44 sm:text-right">
          {supplier.latestEventAt
            ? t('suppliers.usedIn', {
                count: supplier.eventCount,
                date: formatLongDay(utcIsoToBrussels(supplier.latestEventAt).date),
              })
            : t('suppliers.neverUsed')}
        </span>
      </div>
    </li>
  );
}
