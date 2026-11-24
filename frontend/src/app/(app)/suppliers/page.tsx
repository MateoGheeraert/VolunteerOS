import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { SupplierDirectory } from '@/features/suppliers/supplier-directory';
import { listSuppliers } from '@/server/suppliers/queries';

export const metadata: Metadata = { title: 'Leveranciers' };

export default function SuppliersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 max-w-5xl rounded-3xl bg-card" />}>
      <Suppliers />
    </Suspense>
  );
}

/** The organization's suppliers, so nobody has to search old emails every year. */
async function Suppliers() {
  const suppliers = await listSuppliers();
  return <SupplierDirectory suppliers={suppliers} />;
}
