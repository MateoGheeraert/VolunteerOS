/**
 * Where to go after login/signup. Only same-site paths are allowed, so a crafted
 * `?next=https://evil.example` link can't send someone off-site.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/events'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }
  return next;
}

/** "KLJ Merkem!" → "klj-merkem". Organization slugs are never shown, they only need to be unique. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'organisatie';
}
