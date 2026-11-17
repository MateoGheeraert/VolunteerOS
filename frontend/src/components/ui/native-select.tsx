import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A native <select> styled like Input. Native on purpose: it works with `register`, keyboards and
 * screen readers out of the box, and opens the platform picker on phones.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative w-full min-w-0">
      <select
        data-slot="native-select"
        className={cn(
          'h-11 w-full min-w-0 appearance-none truncate rounded-xl border-2 border-input bg-background py-1 pr-10 pl-3.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
          className,
        )}
        {...props}
      />
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}

export { NativeSelect };
