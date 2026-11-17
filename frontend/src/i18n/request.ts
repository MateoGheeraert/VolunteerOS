import { getRequestConfig } from 'next-intl/server';
import messages from '../messages/nl.json';

/**
 * Dutch (nl-BE) only for the MVP, with no locale in the URL. Every UI string lives in
 * messages/nl.json, so adding English later means adding a file and a locale switch.
 * The locale is fixed (never read from the request), so translated UI can stay in the static shell.
 */
export default getRequestConfig(async () => ({
  locale: 'nl-BE',
  timeZone: 'Europe/Brussels',
  messages,
}));
