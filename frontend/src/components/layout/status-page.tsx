import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconBlob } from './icon-blob';

/** Full-height message for not-found, forbidden and error screens. */
export function StatusPage({
  icon,
  tone = 'brand',
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  tone?: 'brand' | 'warn' | 'bad';
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-3xl bg-card px-6 py-10 text-center shadow-soft">
        <IconBlob icon={icon} tone={tone} size="lg" />
        <h1 className="text-2xl">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
        {children}
      </div>
    </main>
  );
}
