import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** Knows our own theme values, so `rounded-card` replaces a component's `rounded-lg` instead of sitting next to it. */
const twMerge = extendTailwindMerge({
  extend: { theme: { radius: ['card'] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
