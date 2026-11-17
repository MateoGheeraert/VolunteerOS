import { HeartHandshake } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BrandLogo({
  className,
  showName = true,
}: {
  className?: string;
  showName?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-lg font-extrabold', className)}>
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
        <HeartHandshake className="size-5" aria-hidden />
      </span>
      {showName && <span>VolunteerOS</span>}
    </span>
  );
}
