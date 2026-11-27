import type { EventType } from '../../db/schema/index.js';

/**
 * Staffing rules of thumb per event type and team: what Mila falls back on when an event has no
 * previous edition to learn from (docs/info.md §7.7.1 A). Deliberately rough, Flemish volunteer
 * practice rather than science; code turns each rule into a headcount for the event, so the
 * model gets numbers instead of formulas. Tune the numbers here when pilots say they're off.
 */

/**
 * How a team's size follows the crowd:
 * - `flow`: people come and go (a market's bar). One volunteer per `per` visitors an hour at
 *   the peak, the peak hour taken as PEAK_FACTOR × the average.
 * - `present`: everybody is there at once (a seated dinner). One volunteer per `per` guests.
 * - `fixed`: the same size whatever the crowd (setup, a cloakroom).
 */
export type StaffingBasis =
  | { kind: 'flow'; per: number }
  | { kind: 'present'; per: number }
  | { kind: 'fixed'; people: number };

/** When the team works: before the event (setup), during it, or after it (teardown). */
export type StaffingPhase = 'setup' | 'during' | 'teardown';

export interface StaffingRule {
  team: string;
  description: string;
  basis: StaffingBasis;
  phase: StaffingPhase;
  /** Typical shift length in hours, as a range. */
  shiftHours: [number, number];
  /** Never fewer or more volunteers per shift than this. */
  min: number;
  max: number;
  /** Extra advice, shown to the model as is. */
  note?: string;
}

/** The busiest hour relative to the average one. */
export const PEAK_FACTOR = 2.5;

const opbouw = (people: number, note?: string): StaffingRule => ({
  team: 'Opbouw',
  description: 'Tenten, tafels en materiaal klaarzetten.',
  basis: { kind: 'fixed', people },
  phase: 'setup',
  shiftHours: [3, 4],
  min: 3,
  max: 12,
  note: note ?? 'Bij voorkeur de dag of avond ervoor, zodat alles klaarstaat bij de start.',
});

const afbraak = (people: number): StaffingRule => ({
  team: 'Afbraak',
  description: 'Opruimen, afbreken en afval wegbrengen.',
  basis: { kind: 'fixed', people },
  phase: 'teardown',
  shiftHours: [2, 3],
  min: 3,
  max: 12,
  note: 'Direct na het evenement; met meer handen gaat het sneller.',
});

const bar = (per: number): StaffingRule => ({
  team: 'Bar',
  description: 'Drank schenken en afrekenen aan de toog.',
  basis: { kind: 'flow', per },
  phase: 'during',
  shiftHours: [3, 4],
  min: 2,
  max: 10,
});

const kassa = (per: number): StaffingRule => ({
  team: 'Kassa',
  description: 'Bonnetjes of tickets verkopen en wisselgeld beheren.',
  basis: { kind: 'flow', per },
  phase: 'during',
  shiftHours: [3, 4],
  min: 1,
  max: 4,
  note: 'Altijd minstens twee mensen bij geld, ook als het rustig is.',
});

const onthaal: StaffingRule = {
  team: 'Onthaal',
  description: 'Mensen verwelkomen, de weg wijzen en vragen beantwoorden.',
  basis: { kind: 'fixed', people: 2 },
  phase: 'during',
  shiftHours: [2, 3],
  min: 1,
  max: 4,
};

export const STAFFING_CATALOGUE: Record<EventType, StaffingRule[]> = {
  market: [
    opbouw(6),
    bar(75),
    kassa(200),
    {
      team: 'Eetkraam',
      description: 'Eten bereiden en verkopen.',
      basis: { kind: 'flow', per: 100 },
      phase: 'during',
      shiftHours: [3, 4],
      min: 2,
      max: 8,
    },
    afbraak(6),
  ],
  festival: [
    opbouw(10, 'Grote opbouw: begin een dag of twee vooraf.'),
    bar(75),
    kassa(250),
    {
      team: 'Security',
      description: 'Toegang controleren en een oogje in het zeil houden.',
      basis: { kind: 'flow', per: 250 },
      phase: 'during',
      shiftHours: [3, 4],
      min: 2,
      max: 12,
      note: 'Professionele bewaking kan verplicht zijn; vrijwilligers helpen enkel aan de ingang.',
    },
    {
      team: 'Parking',
      description: 'Wagens en fietsen in goede banen leiden.',
      basis: { kind: 'flow', per: 300 },
      phase: 'during',
      shiftHours: [2, 3],
      min: 2,
      max: 6,
      note: 'Vooral bij de start nodig.',
    },
    afbraak(10),
  ],
  party: [
    opbouw(5),
    bar(60),
    kassa(250),
    {
      team: 'Vestiaire',
      description: 'Jassen aannemen en teruggeven.',
      basis: { kind: 'fixed', people: 2 },
      phase: 'during',
      shiftHours: [3, 4],
      min: 2,
      max: 4,
      note: 'Druk bij aankomst en op het einde.',
    },
    afbraak(6),
  ],
  quiz: [
    opbouw(3, 'Tafels en scherm een paar uur vooraf klaarzetten.'),
    bar(40),
    {
      team: 'Jury',
      description: 'Antwoorden verbeteren en scores bijhouden.',
      basis: { kind: 'present', per: 15 },
      phase: 'during',
      shiftHours: [3, 4],
      min: 2,
      max: 6,
      note: 'Eén jurylid per ongeveer 3 ploegen.',
    },
    afbraak(3),
  ],
  meal: [
    opbouw(4, 'Tafels dekken de middag zelf, enkele uren voor de deuren opengaan.'),
    {
      team: 'Keuken',
      description: 'Koken, opscheppen en borden klaarmaken.',
      basis: { kind: 'present', per: 40 },
      phase: 'during',
      shiftHours: [3, 5],
      min: 3,
      max: 12,
    },
    {
      team: 'Bediening',
      description: 'Borden en drank naar de tafels brengen en afruimen.',
      basis: { kind: 'present', per: 25 },
      phase: 'during',
      shiftHours: [3, 4],
      min: 2,
      max: 15,
    },
    bar(50),
    kassa(300),
    {
      team: 'Afwas',
      description: 'Borden, bestek en potten afwassen.',
      basis: { kind: 'present', per: 60 },
      phase: 'during',
      shiftHours: [2, 3],
      min: 2,
      max: 6,
      note: 'Vooral de tweede helft van de avond.',
    },
    afbraak(4),
  ],
  sports: [
    opbouw(6),
    {
      team: 'Inschrijvingen',
      description: 'Deelnemers inschrijven en rugnummers geven.',
      basis: { kind: 'flow', per: 150 },
      phase: 'during',
      shiftHours: [2, 3],
      min: 2,
      max: 6,
    },
    {
      team: 'Seingevers',
      description: 'Het parcours beveiligen op kruispunten.',
      basis: { kind: 'fixed', people: 6 },
      phase: 'during',
      shiftHours: [2, 4],
      min: 2,
      max: 20,
      note: 'Hangt af van het aantal kruispunten op het parcours.',
    },
    bar(75),
    afbraak(6),
  ],
  camp: [
    opbouw(4, 'Materiaal laden en het terrein inrichten voor de deelnemers komen.'),
    {
      team: 'Keuken',
      description: 'Maaltijden voor de deelnemers.',
      basis: { kind: 'present', per: 15 },
      phase: 'during',
      shiftHours: [4, 6],
      min: 2,
      max: 6,
    },
    afbraak(4),
  ],
  trip: [
    {
      team: 'Begeleiding',
      description: 'De groep begeleiden en tellen.',
      basis: { kind: 'present', per: 10 },
      phase: 'during',
      shiftHours: [4, 8],
      min: 2,
      max: 10,
    },
  ],
  other: [opbouw(4), onthaal, bar(75), afbraak(4)],
};

/**
 * Volunteers per shift for one rule at this event. `openHours` is the event's own length
 * (setup and teardown excluded); without an expected attendance, the rule's minimum.
 */
export function headcount(
  rule: StaffingRule,
  expectedAttendance: number | null,
  openHours: number,
): number {
  const { basis } = rule;
  let people: number;
  if (basis.kind === 'fixed') people = basis.people;
  else if (expectedAttendance === null || expectedAttendance <= 0) people = rule.min;
  else if (basis.kind === 'present') people = Math.ceil(expectedAttendance / basis.per);
  else {
    const perHour = expectedAttendance / Math.max(1, openHours);
    people = Math.ceil((perHour * PEAK_FACTOR) / basis.per);
  }
  return Math.min(rule.max, Math.max(rule.min, people));
}

/** The rule in words, for the model: "1 per 75 bezoekers per uur op het drukste moment". */
export function describeBasis(basis: StaffingBasis): string {
  switch (basis.kind) {
    case 'flow':
      return `1 volunteer per ${basis.per} visitors per hour at the peak`;
    case 'present':
      return `1 volunteer per ${basis.per} guests present`;
    case 'fixed':
      return `${basis.people} volunteers, whatever the crowd`;
  }
}
