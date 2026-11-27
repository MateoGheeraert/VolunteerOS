import type { EventType } from '../../db/schema/index.js';

/**
 * Typical costs of an event in Belgium that organizers forget, with an indicative price range
 * ("richtprijs"). Mila proposes an item when it applies and the budget has no line for it; the
 * proposed estimate is the middle of the range, shown with "vraag een offerte".
 *
 * Event type and visitor thresholds are checked in code (`checklistFor`); conditions that only the
 * event's description can tell (`when`: is there music, a bar, is it outside) are left to Mila.
 * Ranges are rough on purpose: they are a reminder to ask for a quote, not a price list.
 */
export interface ChecklistItem {
  key: string;
  /** What the line is called in the budget (Dutch, as organizers write it). */
  title: string;
  /** For the model: when the cost applies, beyond the type and size checked in code. */
  when: string;
  /** For the model: why organizers need it. */
  reason: string;
  /**
   * Words in a line's title that mean this cost is already there ("Verlichting en elektriciteit"
   * covers power), so the planner never proposes it twice. Lower case; matched at word starts.
   */
  keywords: readonly string[];
  /** Euro cents. */
  minCents: number;
  maxCents: number;
  /** Only for these event types; every type when absent. */
  eventTypes?: readonly EventType[];
  /** Only from this many expected visitors (when the number is known). */
  minAttendance?: number;
}

const OUTDOOR_TYPES = ['festival', 'market', 'party', 'sports'] as const satisfies EventType[];

export const BUDGET_CHECKLIST: readonly ChecklistItem[] = [
  {
    key: 'unisono',
    title: 'Unisono (muziekrechten)',
    when: 'music is played: a DJ, a band, or recorded background music',
    reason:
      'Playing music at an event means paying copyright and the fair remuneration ' +
      '(billijke vergoeding) through Unisono, formerly SABAM.',
    keywords: ['unisono', 'sabam', 'muziekrecht', 'auteursrecht', 'billijke vergoeding'],
    minCents: 5_000,
    maxCents: 40_000,
  },
  {
    key: 'insurance',
    title: 'Verzekering burgerlijke aansprakelijkheid organisator',
    when: 'always, unless the organization says it has a yearly policy that covers events',
    reason:
      'The organization is liable for damage to visitors and others; an event policy covers it.',
    keywords: ['verzekering', 'aansprakelijk', 'polis'],
    minCents: 10_000,
    maxCents: 35_000,
  },
  {
    key: 'permit',
    title: 'Evenementenvergunning gemeente',
    when: 'a public event, or one on public ground',
    reason:
      'A public event needs the municipality’s permission, sometimes with a file fee or a charge ' +
      'for using public ground.',
    keywords: ['vergunning', 'toelating'],
    minCents: 0,
    maxCents: 15_000,
  },
  {
    key: 'first_aid',
    title: 'EHBO-post (Rode Kruis)',
    when: 'many visitors at once',
    reason:
      'From a few hundred visitors the municipality often asks for a first-aid post; the Red ' +
      'Cross charges a fee per volunteer.',
    keywords: ['ehbo', 'rode kruis', 'eerste hulp'],
    minCents: 15_000,
    maxCents: 60_000,
    minAttendance: 500,
  },
  {
    key: 'security',
    title: 'Erkende bewaking',
    when: 'a party or festival with many visitors, often at night',
    reason: 'For parties and festivals the municipality often requires licensed security.',
    keywords: ['bewaking', 'security', 'beveiliging'],
    minCents: 40_000,
    maxCents: 150_000,
    eventTypes: ['party', 'festival'],
    minAttendance: 500,
  },
  {
    key: 'waste',
    title: 'Afval: container en zakken',
    when: 'food or drinks are served',
    reason: 'Event waste is not part of the regular collection; a container or bags cost money.',
    keywords: ['afval', 'container', 'vuilnis'],
    minCents: 8_000,
    maxCents: 30_000,
    minAttendance: 100,
  },
  {
    key: 'toilets',
    title: 'Mobiele toiletten',
    when: 'outdoors, or the venue has too few toilets for the visitors',
    reason: 'Without enough toilets on site, mobile toilets or a toilet trailer are needed.',
    keywords: ['toilet', 'wc', 'sanitair'],
    minCents: 25_000,
    maxCents: 90_000,
    eventTypes: OUTDOOR_TYPES,
    minAttendance: 200,
  },
  {
    key: 'power',
    title: 'Stroom of generator',
    when: 'outdoors, or the bar, lights and sound need more power than the venue has',
    reason: 'A temporary power connection or a generator is easily forgotten and not cheap.',
    keywords: ['stroom', 'generator', 'elektriciteit'],
    minCents: 15_000,
    maxCents: 80_000,
    eventTypes: OUTDOOR_TYPES,
  },
  {
    key: 'glasses',
    title: 'Glazen huren en breuk',
    when: 'there is a bar serving drinks',
    reason:
      'Renting glasses or reusable cups costs a rental fee plus breakage; the deposit comes back, ' +
      'the breakage does not.',
    keywords: ['glazen', 'bekers', 'glasbreuk'],
    minCents: 5_000,
    maxCents: 25_000,
  },
  {
    key: 'fences',
    title: 'Nadarhekken',
    when: 'outdoors or on public ground, to close off the site or guide visitors',
    reason: 'Fences to close off a square or a street are rented, sometimes from the municipality.',
    keywords: ['nadar', 'hekken'],
    minCents: 10_000,
    maxCents: 40_000,
    eventTypes: OUTDOOR_TYPES,
    minAttendance: 300,
  },
  {
    key: 'payments',
    title: 'Kosten betaalterminal en Payconiq',
    when: 'drinks, food or tickets are sold',
    reason: 'Card and app payments cost a monthly fee and a percentage per payment.',
    keywords: ['betaalterminal', 'payconiq', 'bancontact', 'kaartbetaling', 'sumup'],
    minCents: 2_000,
    maxCents: 15_000,
  },
];

/** Whether a line title is about the item's cost, by its keywords at the start of a word. */
export function coversItem(title: string, item: Pick<ChecklistItem, 'keywords'>): boolean {
  const text = title.toLowerCase();
  return item.keywords.some((word) => new RegExp(`(^|[^\\p{L}])${word}`, 'u').test(text));
}

/** The checklist items that fit the event's type and expected size. */
export function checklistFor(
  eventType: EventType,
  expectedAttendance: number | null,
  checklist: readonly ChecklistItem[] = BUDGET_CHECKLIST,
): ChecklistItem[] {
  return checklist.filter(
    (item) =>
      (!item.eventTypes || item.eventTypes.includes(eventType)) &&
      (item.minAttendance === undefined ||
        expectedAttendance === null ||
        expectedAttendance >= item.minAttendance),
  );
}
