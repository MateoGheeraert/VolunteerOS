import type { PromotionAudience } from '../../db/schema/index.js';
import type { SizeBand } from '../../features/promotion/promotion-rules.js';
import type { PromoActionType, PromoEffort } from '../ai.types.js';

/**
 * The promotion actions Mila may propose (docs/info.md §7.11): what volunteer organizations in
 * Flanders actually do. Mila adapts them to the event (wording, timing, cost) but never invents
 * one: every action in her plan cites one of these, or a task of the previous edition.
 *
 * Keys are stable: they are the dedup key of a suggestion, so a rejected action never returns.
 */
export interface PromoCatalogItem {
  key: string;
  title: string;
  type: PromoActionType;
  /** The audiences it reaches; empty: everyone. */
  audiences: PromotionAudience[];
  sizes: SizeBand[];
  /** Usually done this many weeks before the event. 0–2: still works last-minute. */
  leadWeeks: number;
  /** What it typically costs, in cents. */
  costMinCents: number;
  costMaxCents: number;
  effort: PromoEffort;
  /** Step by step, for the task's description. Mila adapts it to the event. */
  howTo: string;
}

const ALL_SIZES: SizeBand[] = ['S', 'M', 'L'];

export const PROMO_CATALOG: readonly PromoCatalogItem[] = [
  {
    key: 'posters-local-shops',
    title: 'Affiches in lokale winkels en cafés',
    type: 'offline',
    audiences: ['neighbours', 'families', 'young_families', 'adults', 'seniors'],
    sizes: ALL_SIZES,
    leadWeeks: 4,
    costMinCents: 3000,
    costMaxCents: 15000,
    effort: 'medium',
    howTo:
      '1. Ontwerp een A3-affiche: naam, datum, plaats, prijs en één blikvanger.\n' +
      '2. Laat 30–50 stuks drukken (bestel op tijd, drukkers hebben soms vertraging).\n' +
      '3. Verdeel een lijst: bakker, apotheek, cafés, frituur, supermarkt.\n' +
      '4. Vraag of de affiche tot na het event mag hangen en haal ze nadien weer weg.',
  },
  {
    key: 'flyers-schools',
    title: 'Flyers meegeven via de lagere scholen',
    type: 'offline',
    audiences: ['children', 'young_families', 'families'],
    sizes: ['S', 'M'],
    leadWeeks: 4,
    costMinCents: 2000,
    costMaxCents: 8000,
    effort: 'medium',
    howTo:
      '1. Vraag de directie of flyers mee mogen in de boekentas of via Smartschool.\n' +
      '2. Tel per school het aantal leerlingen en laat genoeg A5-flyers drukken.\n' +
      '3. Breng ze ten laatste drie weken vooraf binnen, gebundeld per klas.',
  },
  {
    key: 'flyers-higher-education',
    title: 'Flyers en affiches op hogescholen en unief',
    type: 'offline',
    audiences: ['students', 'young_adults'],
    sizes: ['M', 'L'],
    leadWeeks: 4,
    costMinCents: 3000,
    costMaxCents: 12000,
    effort: 'medium',
    howTo:
      '1. Vraag bij de studentenvoorziening of studentenraad waar affiches mogen hangen.\n' +
      '2. Leg flyers in de cafetaria, bib en studentenhomes.\n' +
      '3. Doe het op een weekdag tijdens de lesweken, niet in de examenperiode.',
  },
  {
    key: 'lineup-reveal-series',
    title: 'Line-up bekendmaken in een reeks posts',
    type: 'social',
    audiences: ['teens', 'young_adults', 'students', 'music_lovers'],
    sizes: ['M', 'L'],
    leadWeeks: 6,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'medium',
    howTo:
      '1. Plan één act per post, twee à drie per week, de headliner als laatste.\n' +
      '2. Maak een vaste huisstijl voor de posts (Canva-sjabloon).\n' +
      '3. Tag de artiesten zodat zij het delen.\n' +
      '4. Eindig met een overzichtspost met de volledige line-up.',
  },
  {
    key: 'ticket-giveaway-partner',
    title: 'Ticketwedstrijd met een partner',
    type: 'giveaway',
    audiences: ['teens', 'young_adults', 'students', 'music_lovers'],
    sizes: ['M', 'L'],
    leadWeeks: 4,
    costMinCents: 0,
    costMaxCents: 10000,
    effort: 'medium',
    howTo:
      '1. Zoek een partner met bereik bij je publiek (jeugdhuis, studentenkring, lokale zaak).\n' +
      '2. Geef 2–5 duotickets weg: "tag een vriend en deel".\n' +
      '3. Spreek de looptijd en de trekking af, en maak de winnaars publiek bekend.',
  },
  {
    key: 'uitinvlaanderen',
    title: 'Event op UiTinVlaanderen zetten',
    type: 'listing',
    audiences: [],
    sizes: ALL_SIZES,
    leadWeeks: 6,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Maak een gratis account op UiTdatabank (uitdatabank.be).\n' +
      '2. Voer het event in met datum, plaats, prijs, een foto en de doelgroep.\n' +
      '3. Het verschijnt dan ook in de UiT-agenda van je gemeente en op UiTinVlaanderen.',
  },
  {
    key: 'municipal-magazine',
    title: 'Aankondiging in het gemeentelijk infoblad',
    type: 'listing',
    audiences: ['neighbours', 'families', 'young_families', 'adults', 'seniors'],
    sizes: ALL_SIZES,
    leadWeeks: 8,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Zoek de deadline van het infoblad op: vaak 6–8 weken vóór verschijnen.\n' +
      '2. Stuur een korte tekst (max. 80 woorden) en een liggende foto naar de communicatiedienst.\n' +
      '3. Vraag meteen of het ook op de website en het digitale infoscherm kan.',
  },
  {
    key: 'story-takeover',
    title: 'Instagram-story takeover',
    type: 'social',
    audiences: ['teens', 'young_adults', 'students'],
    sizes: ['M', 'L'],
    leadWeeks: 2,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'medium',
    howTo:
      '1. Laat een artiest, leiding of bekende kop één dag jullie Instagram-stories overnemen.\n' +
      '2. Spreek af wat ze tonen (voorbereiding, repetitie, opbouw) en wat niet.\n' +
      '3. Eindig de dag met een oproep en de link naar tickets of info.',
  },
  {
    key: 'youth-movement-word-of-mouth',
    title: 'Mond-tot-mondreclame via de jeugdbewegingen',
    type: 'word_of_mouth',
    audiences: ['children', 'teens', 'families', 'young_families', 'associations'],
    sizes: ['S', 'M'],
    leadWeeks: 3,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Vraag de leiding van Chiro, scouts, KLJ… om het event aan te kondigen op de vergadering.\n' +
      '2. Geef hen een kort berichtje voor de ouders-mail of WhatsApp-groep.\n' +
      '3. Bied iets terug: een vermelding, een drankje of samen een stand.',
  },
  {
    key: 'whatsapp-chain',
    title: 'WhatsApp-ketting',
    type: 'word_of_mouth',
    audiences: [],
    sizes: ['S', 'M'],
    leadWeeks: 2,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Schrijf één kort bericht met datum, plaats, prijs en een link of affiche.\n' +
      '2. Vraag elke vrijwilliger het te sturen naar drie groepen (familie, vrienden, club).\n' +
      '3. Herhaal de oproep een paar dagen voor het event.',
  },
  {
    key: 'facebook-event',
    title: 'Facebook-evenement met co-hosts',
    type: 'social',
    audiences: ['adults', 'families', 'young_families', 'seniors', 'neighbours', 'associations'],
    sizes: ALL_SIZES,
    leadWeeks: 6,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Maak het evenement aan met een omslagfoto, datum, plaats en prijs.\n' +
      '2. Voeg partners en verenigingen toe als co-host: het verschijnt dan ook bij hun volgers.\n' +
      '3. Post er wekelijks iets nieuws in, zodat geïnteresseerden een melding krijgen.',
  },
  {
    key: 'local-paid-social',
    title: 'Gesponsorde post in de buurt (Facebook/Instagram)',
    type: 'social',
    audiences: ['adults', 'families', 'young_families', 'young_adults'],
    sizes: ['M', 'L'],
    leadWeeks: 3,
    costMinCents: 2500,
    costMaxCents: 15000,
    effort: 'low',
    howTo:
      '1. Kies je beste post en promoot hem binnen 15 km rond de locatie.\n' +
      '2. Stel leeftijd in op je doelgroep en laat hem 7–10 dagen lopen.\n' +
      '3. Leg een maximumbudget vast en kijk halverwege naar de resultaten.',
  },
  {
    key: 'instagram-countdown',
    title: 'Aftelreeks in Instagram-stories',
    type: 'social',
    audiences: ['teens', 'young_adults', 'students'],
    sizes: ALL_SIZES,
    leadWeeks: 2,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Zet een aftel-sticker in een story, zodat volgers een herinnering krijgen.\n' +
      '2. Post de laatste tien dagen elke dag een kort weetje of beeld.\n' +
      '3. Vraag vrijwilligers om de stories te delen.',
  },
  {
    key: 'local-press-release',
    title: 'Persbericht naar lokale krant en regionale tv',
    type: 'press',
    audiences: ['adults', 'seniors', 'families', 'neighbours', 'culture_lovers'],
    sizes: ['M', 'L'],
    leadWeeks: 4,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'medium',
    howTo:
      '1. Schrijf een persbericht van één pagina: wat, wanneer, waar, en wat het bijzonder maakt.\n' +
      '2. Voeg twee goede foto’s toe en een contactpersoon met gsm-nummer.\n' +
      '3. Stuur het naar de lokale correspondent en de regionale tv, en bel een week later na.',
  },
  {
    key: 'local-radio',
    title: 'Aankondiging op de lokale radio',
    type: 'press',
    audiences: ['adults', 'seniors', 'neighbours'],
    sizes: ['M', 'L'],
    leadWeeks: 3,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Zoek de lokale of regionale radio en hun vrije-tijdsagenda.\n' +
      '2. Stuur een korte aankondiging en bied een kort interview aan.',
  },
  {
    key: 'door-to-door-flyers',
    title: 'Flyers in de brievenbussen van de buurt',
    type: 'offline',
    audiences: ['neighbours', 'seniors', 'families', 'young_families'],
    sizes: ['S', 'M'],
    leadWeeks: 2,
    costMinCents: 3000,
    costMaxCents: 12000,
    effort: 'high',
    howTo:
      '1. Kies de straten rond de locatie en tel de brievenbussen.\n' +
      '2. Laat A5-flyers drukken en verdeel de straten over vrijwilligers.\n' +
      '3. Bus twee weken vooraf, met "geen reclame"-stickers gerespecteerd.',
  },
  {
    key: 'roadside-banner',
    title: 'Spandoek langs de invalsweg',
    type: 'offline',
    audiences: [],
    sizes: ['M', 'L'],
    leadWeeks: 4,
    costMinCents: 8000,
    costMaxCents: 25000,
    effort: 'medium',
    howTo:
      '1. Vraag toestemming aan de gemeente of de eigenaar van de plek.\n' +
      '2. Bestel een spandoek met enkel naam, datum en plaats: groot en leesbaar vanuit de auto.\n' +
      '3. Hang het drie à vier weken vooraf op en haal het meteen na het event weg.',
  },
  {
    key: 'neighbours-letter',
    title: 'Buurtbrief voor de omwonenden',
    type: 'offline',
    audiences: ['neighbours'],
    sizes: ALL_SIZES,
    leadWeeks: 2,
    costMinCents: 1000,
    costMaxCents: 4000,
    effort: 'low',
    howTo:
      '1. Schrijf een korte brief: wat er gebeurt, wanneer, en wie ze kunnen bellen.\n' +
      '2. Nodig de buren uit, eventueel met een drankbonnetje.\n' +
      '3. Bus hem twee weken vooraf in de straten rond de locatie.',
  },
  {
    key: 'student-associations',
    title: 'Samenwerken met studentenkringen',
    type: 'partnership',
    audiences: ['students', 'young_adults'],
    sizes: ['M', 'L'],
    leadWeeks: 4,
    costMinCents: 0,
    costMaxCents: 10000,
    effort: 'medium',
    howTo:
      '1. Contacteer de praesidia van een paar kringen in de buurt.\n' +
      '2. Bied een groepsprijs of een kringstand aan in ruil voor een post en een vermelding.\n' +
      '3. Geef hen een kant-en-klare tekst en beeld.',
  },
  {
    key: 'local-clubs-partnership',
    title: 'Samenwerken met lokale verenigingen',
    type: 'partnership',
    audiences: ['associations', 'sporty', 'families', 'adults'],
    sizes: ['S', 'M'],
    leadWeeks: 4,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'medium',
    howTo:
      '1. Lijst de verenigingen op (sportclub, muziekschool, KWB, Femma…).\n' +
      '2. Vraag of ze het event in hun nieuwsbrief of groep willen zetten.\n' +
      '3. Doe iets terug: hun logo op de affiche of een gratis stand.',
  },
  {
    key: 'school-newsletter',
    title: 'Oproep in de nieuwsbrief van school of oudervereniging',
    type: 'listing',
    audiences: ['children', 'young_families', 'families'],
    sizes: ['S', 'M'],
    leadWeeks: 3,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Vraag de oudervereniging wanneer hun volgende nieuwsbrief verschijnt.\n' +
      '2. Stuur een korte tekst met een foto en wat er voor kinderen te doen is.',
  },
  {
    key: 'sponsor-cross-promotion',
    title: 'Sponsors laten meedelen',
    type: 'partnership',
    audiences: [],
    sizes: ALL_SIZES,
    leadWeeks: 3,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Stuur elke sponsor een kant-en-klare post en de affiche.\n' +
      '2. Vraag ze die te delen en de affiche in hun zaak te hangen.\n' +
      '3. Bedank ze publiek in jullie eigen posts.',
  },
  {
    key: 'short-video',
    title: 'Korte video achter de schermen (Reels/TikTok)',
    type: 'social',
    audiences: ['teens', 'young_adults', 'students'],
    sizes: ['M', 'L'],
    leadWeeks: 3,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'medium',
    howTo:
      '1. Film 15–30 seconden: de opbouw, een repetitie, de vrijwilligers.\n' +
      '2. Gebruik een trending geluid en zet datum en plaats in beeld.\n' +
      '3. Post op het moment dat je publiek online is (’s avonds).',
  },
  {
    key: 'local-influencer',
    title: 'Een bekende inwoner of lokale influencer uitnodigen',
    type: 'partnership',
    audiences: ['teens', 'young_adults', 'students', 'music_lovers'],
    sizes: ['M', 'L'],
    leadWeeks: 5,
    costMinCents: 0,
    costMaxCents: 20000,
    effort: 'medium',
    howTo:
      '1. Zoek iemand met volgers in je regio en bij je publiek.\n' +
      '2. Nodig hem of haar uit (gratis toegang, backstage) in ruil voor een post of story.\n' +
      '3. Spreek op voorhand af wat en wanneer er gepost wordt.',
  },
  {
    key: 'regional-event-calendars',
    title: 'Regionale eventagenda’s en stadsmagazines',
    type: 'listing',
    audiences: [],
    sizes: ALL_SIZES,
    leadWeeks: 6,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Zoek de gratis agenda’s van je regio (stadsmagazine, regionale nieuwssite, toerisme).\n' +
      '2. Voer het event in of mail de redactie met de praktische info en een foto.',
  },
  {
    key: 'parish-announcement',
    title: 'Aankondiging in het parochieblad of na de mis',
    type: 'listing',
    audiences: ['seniors', 'neighbours', 'adults', 'families'],
    sizes: ['S', 'M'],
    leadWeeks: 3,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Vraag de parochie of het secretariaat naar de deadline van het parochieblad.\n' +
      '2. Stuur een korte aankondiging en vraag of ze het ook na de mis willen omroepen.',
  },
  {
    key: 'day-before-reminder',
    title: 'Herinneringspost de dag voordien',
    type: 'social',
    audiences: [],
    sizes: ALL_SIZES,
    leadWeeks: 0,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Post de dag voordien: "Morgen is het zover!" met het uur, de plaats en het weerbericht.\n' +
      '2. Zet het ook in de story en in het Facebook-evenement.\n' +
      '3. Vraag vrijwilligers het te delen.',
  },
  {
    key: 'sidewalk-board',
    title: 'Stoepbord op drukke plekken',
    type: 'offline',
    audiences: ['neighbours', 'families', 'adults'],
    sizes: ['S', 'M'],
    leadWeeks: 1,
    costMinCents: 0,
    costMaxCents: 3000,
    effort: 'low',
    howTo:
      '1. Leen of maak een paar A-borden.\n' +
      '2. Zet ze de laatste week op drukke plekken: aan de bakker, de school, het kruispunt.\n' +
      '3. Vraag waar nodig toestemming en haal ze na het event weg.',
  },
  {
    key: 'library-culture-centre',
    title: 'Flyers in bib, cultuurcentrum en jeugdhuis',
    type: 'offline',
    audiences: ['culture_lovers', 'adults', 'teens', 'young_adults', 'seniors'],
    sizes: ALL_SIZES,
    leadWeeks: 4,
    costMinCents: 0,
    costMaxCents: 3000,
    effort: 'low',
    howTo:
      '1. Breng een stapeltje flyers en een affiche naar de bib, het cultuurcentrum en het jeugdhuis.\n' +
      '2. Vraag of het event ook op hun infoscherm of in hun nieuwsbrief kan.',
  },
  {
    key: 'group-discount',
    title: 'Groepskorting voor verenigingen en klassen',
    type: 'partnership',
    audiences: ['associations', 'students', 'families', 'children'],
    sizes: ALL_SIZES,
    leadWeeks: 4,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Bepaal een groepsprijs (bv. vanaf 10 personen).\n' +
      '2. Stuur verenigingen, klassen of kringen een uitnodiging met de groepsprijs.\n' +
      '3. Laat groepen vooraf inschrijven, zodat je weet hoeveel er komen.',
  },
  {
    key: 'sports-club-noticeboard',
    title: 'Affiche in de sportclubs',
    type: 'offline',
    audiences: ['sporty', 'families', 'adults', 'young_adults'],
    sizes: ['S', 'M'],
    leadWeeks: 3,
    costMinCents: 0,
    costMaxCents: 2000,
    effort: 'low',
    howTo:
      '1. Vraag de sporthal en de clubs of je een affiche mag ophangen in de kantine.\n' +
      '2. Vraag de trainers het event na de training te vermelden.',
  },
  {
    key: 'previous-edition-photos',
    title: 'Foto’s van de vorige editie delen',
    type: 'social',
    audiences: [],
    sizes: ALL_SIZES,
    leadWeeks: 4,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Kies de tien beste foto’s van vorig jaar (met toestemming van wie erop staat).\n' +
      '2. Post er wekelijks een paar met "Dit jaar weer van de partij?".\n' +
      '3. Tag vrijwilligers en bezoekers die erop staan, zodat zij het delen.',
  },
  {
    key: 'lineup-playlist',
    title: 'Playlist met de line-up delen',
    type: 'social',
    audiences: ['music_lovers', 'young_adults', 'students', 'teens'],
    sizes: ['M', 'L'],
    leadWeeks: 4,
    costMinCents: 0,
    costMaxCents: 0,
    effort: 'low',
    howTo:
      '1. Maak een Spotify-playlist met een paar nummers van elke act.\n' +
      '2. Deel de link in de posts en de bio, en vraag de artiesten hem mee te delen.',
  },
];

/** Last-minute: an action that can still be done with this many weeks or fewer to go. */
export const LAST_MINUTE_LEAD_WEEKS = 2;

export interface CatalogFilter {
  audiences: readonly PromotionAudience[];
  /** Null without an expected attendance: every size. */
  sizeBand: SizeBand | null;
  lastMinute: boolean;
  /** Null without a promotion budget: only actions that can be done cheaply. */
  availableCents: number | null;
  /** The most a single action may cost without a budget. */
  cheapMaxCents: number;
  /** Catalogue keys already decided (accepted or rejected): never offered again. */
  excludedKeys: ReadonlySet<string>;
}

/**
 * The actions worth showing Mila for this event, best audience match first: they suit its size,
 * reach at least one of its audiences, can still be done in time and fit the money there is.
 */
export function catalogFor(
  filter: CatalogFilter,
  catalog: readonly PromoCatalogItem[] = PROMO_CATALOG,
): PromoCatalogItem[] {
  const wanted = new Set(filter.audiences);
  const overlap = (item: PromoCatalogItem) =>
    item.audiences.filter((audience) => wanted.has(audience)).length;
  return catalog
    .filter((item) => !filter.excludedKeys.has(item.key))
    .filter((item) => filter.sizeBand === null || item.sizes.includes(filter.sizeBand))
    .filter((item) => item.audiences.length === 0 || wanted.size === 0 || overlap(item) > 0)
    .filter((item) => !filter.lastMinute || item.leadWeeks <= LAST_MINUTE_LEAD_WEEKS)
    .filter((item) =>
      filter.availableCents === null
        ? item.costMinCents <= filter.cheapMaxCents
        : item.costMinCents <= filter.availableCents,
    )
    .map((item, index) => ({ item, index, score: overlap(item) }))
    .toSorted((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}
