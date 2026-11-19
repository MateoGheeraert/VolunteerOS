import Image from 'next/image';
import { cn } from '@/lib/utils';
import milaPicture from '../../../public/mila_pf.png';

/** The AI assistant's name, shown everywhere she appears. */
export const MILA_NAME = 'Mila';

const sizes = {
  xs: 'size-5',
  sm: 'size-8',
  md: 'size-11',
  lg: 'size-16',
} as const;
/** Pixel widths for next/image, so it serves a small file, not the 1254 px original. */
const pixels = { xs: 20, sm: 32, md: 44, lg: 64 } as const;

/**
 * Mila's face. `thinking` adds a soft pulsing ring while she works on something. Decorative by
 * default (her name is always written next to her); pass `alt` where the picture stands alone.
 */
export function MilaAvatar({
  size = 'md',
  thinking = false,
  alt = '',
  className,
}: {
  size?: keyof typeof sizes;
  thinking?: boolean;
  alt?: string;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-grid shrink-0', sizes[size], className)}>
      {thinking && (
        <span
          aria-hidden
          className="absolute -inset-1 animate-ping rounded-full bg-mila-bright/30 [animation-duration:1.6s]"
        />
      )}
      <Image
        src={milaPicture}
        alt={alt}
        width={pixels[size]}
        height={pixels[size]}
        sizes={`${pixels[size]}px`}
        className={cn(
          'relative rounded-full ring-2 ring-mila-tint-strong',
          sizes[size],
          thinking && 'ring-mila-bright',
        )}
      />
    </span>
  );
}
