import { useTranslations } from 'next-intl';
import type { Event } from '@/api/generated/types.gen';
import { Badge } from '@/components/ui/badge';

const variants = {
  draft: 'outline',
  published: 'brand',
  completed: 'ok',
  archived: 'secondary',
} as const satisfies Record<Event['status'], string>;

export function EventStatusBadge({ status }: { status: Event['status'] }) {
  const t = useTranslations('eventStatus');
  return <Badge variant={variants[status]}>{t(status)}</Badge>;
}
