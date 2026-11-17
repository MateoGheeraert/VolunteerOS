import type messages from '../messages/nl.json';

// Type-checks translation keys: t('events.title') fails to compile if the key is missing.
declare module 'next-intl' {
  interface AppConfig {
    Locale: 'nl-BE';
    Messages: typeof messages;
  }
}
