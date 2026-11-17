import type messages from '@/messages/nl.json';

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every translation key in messages/nl.json, e.g. 'eventForm.validation.nameRequired'. */
export type MessageKey = Leaves<typeof messages>;

/**
 * Marks a translation key used as a validation or error message. Schemas and server errors carry
 * keys, not text, so they are the same on client and server; the UI translates them when shown.
 */
export const msg = <K extends MessageKey>(key: K): K => key;
