'use client';

import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { NewSupplierDialog } from './new-supplier-dialog';

/** A supplier as the picker shows it. */
export interface PickableSupplier {
  id: string;
  name: string;
  archived: boolean;
}

/**
 * Picks the supplier of a budget entry: search the organization's active suppliers, or add a new
 * one in a dialog, which then gets picked. Archived suppliers can't be picked anew: one the entry
 * already has stays shown (marked), and typing an archived one's name says so instead of offering
 * a duplicate. Arrow keys move between the search field and the results. `value` is '' for none.
 */
export function SupplierPicker({
  id,
  suppliers,
  value,
  onChange,
}: {
  id: string;
  /** The organization's suppliers, archived ones included (they are only shown, not offered). */
  suppliers: PickableSupplier[];
  value: string;
  onChange: (supplierId: string) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  // Suppliers added here, until the page data includes them.
  const [added, setAdded] = useState<PickableSupplier[]>([]);
  const all = [...suppliers, ...added.filter((a) => !suppliers.some((s) => s.id === a.id))];
  const selected = all.find((supplier) => supplier.id === value);

  const query = search.trim().toLowerCase();
  const matches = all
    .filter((supplier) => !supplier.archived)
    .filter((supplier) => supplier.name.toLowerCase().includes(query));
  const exact = all.find((supplier) => supplier.name.toLowerCase() === query);
  const list = useRef<HTMLUListElement>(null);

  /** Up and down walk the results; up from the first one goes back to the search field. */
  const moveFocus = (event: KeyboardEvent, from: number) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const options = [...(list.current?.querySelectorAll('button') ?? [])];
    const next = from + (event.key === 'ArrowDown' ? 1 : -1);
    if (next < 0) {
      list.current?.parentElement?.querySelector('input')?.focus();
    } else {
      options[Math.min(next, options.length - 1)]?.focus();
    }
  };

  const pick = (supplierId: string) => {
    onChange(supplierId);
    setOpen(false);
    setSearch('');
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <div className="flex gap-1">
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              className="min-w-0 flex-1 justify-between bg-transparent font-normal"
            >
              <span
                className={cn(
                  'flex min-w-0 items-center gap-2',
                  !selected && 'text-muted-foreground',
                )}
              >
                <span className="truncate">{selected?.name ?? t('suppliers.picker.none')}</span>
                {selected?.archived && <Badge variant="outline">{t('suppliers.archived')}</Badge>}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
            </Button>
          </PopoverTrigger>
          {selected && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('suppliers.picker.clear')}
              onClick={() => onChange('')}
            >
              <X aria-hidden />
            </Button>
          )}
        </div>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-2">
          {/* The popover focuses this search field when it opens. */}
          <Input
            aria-label={t('suppliers.picker.search')}
            placeholder={t('suppliers.picker.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') return moveFocus(event, -1);
              if (event.key !== 'Enter') return;
              // Enter picks the only match; it never submits the entry's form.
              event.preventDefault();
              if (matches.length === 1) pick(matches[0]!.id);
            }}
          />
          <ul
            ref={list}
            aria-label={t('suppliers.title')}
            className="mt-2 max-h-64 overflow-y-auto"
          >
            {matches.map((supplier, index) => (
              <li key={supplier.id}>
                <button
                  type="button"
                  aria-pressed={supplier.id === value}
                  onClick={() => pick(supplier.id)}
                  onKeyDown={(event) => moveFocus(event, index)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
                >
                  <Check
                    className={cn('size-4 shrink-0', supplier.id !== value && 'invisible')}
                    aria-hidden
                  />
                  <span className="truncate">{supplier.name}</span>
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">
                {exact?.archived
                  ? t('suppliers.picker.archivedMatch', { name: exact.name })
                  : t('suppliers.picker.noMatch')}
              </li>
            )}
          </ul>
          {!exact && (
            <Button
              type="button"
              variant="ghost"
              className="mt-1 w-full justify-start"
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
            >
              <Plus data-icon="inline-start" aria-hidden />
              <span className="truncate">
                {query
                  ? t('suppliers.picker.createNamed', { name: search.trim() })
                  : t('suppliers.new')}
              </span>
            </Button>
          )}
        </PopoverContent>
      </Popover>

      <NewSupplierDialog
        open={creating}
        onOpenChange={setCreating}
        initialName={search.trim()}
        onCreated={(supplier) => {
          setAdded((current) => [...current, { ...supplier, archived: false }]);
          setSearch('');
          onChange(supplier.id);
        }}
      />
    </>
  );
}
