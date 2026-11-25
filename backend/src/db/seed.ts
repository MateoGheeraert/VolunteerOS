/**
 * Fills the dev database with a known state to click through features:
 *
 *   pnpm db:seed
 *
 * - Owner:  mateogheeraert04@gmail.com / Hallo1234
 * - Member: lid@volunteeros.test       / Hallo1234
 * - Organization "Chiro Sint-Jan (seed)" with the event "Kerstmarkt 2026" (labels, tasks in every
 *   status, an overdue task, a pending assignment request, a budget with income and costs in every
 *   state: estimated only, paid, over and under budget, labelled and linked to tasks) and its
 *   previous edition (with a settled budget). Suppliers (one archived, one never used) on the
 *   budget lines of both editions. Planning for the Kerstmarkt: teams, shifts and volunteers,
 *   partly placed (some confirmed, some proposed, some still waiting), registration open.
 * - The event overview in its three states: the Kerstmarkt in mid-preparation (an overdue task,
 *   planning partly filled), its previous edition after the event (a result and one task left
 *   open), and "Spaghettiavond", a brand-new draft with nothing in it yet (Mila's setup state).
 *
 * Keep this in step with the features: a new feature adds its data here.
 *
 * Re-runnable: the users are kept (password, name and verification are reset), the seed
 * organization is deleted with everything in it and created again. Other organizations of the
 * users are left alone. Dates are relative to today, so the event is always a few weeks away.
 *
 * The passwords are shorter than `minPasswordLength`: they are hashed here directly, and signing
 * in does not check the length.
 */
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { and, eq, inArray, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.js';
import type { Transaction } from './database.js';

const PASSWORD = 'Hallo1234';
const ORG_SLUG = 'seed-chiro-sint-jan';

const USERS = {
  owner: { name: 'Mateo Gheeraert', email: 'mateogheeraert04@gmail.com' },
  member: { name: 'Lotte Peeters', email: 'lid@volunteeros.test' },
} as const;

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed: NODE_ENV is production.');
  process.exit(1);
}
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Set DATABASE_URL (or DATABASE_URL_UNPOOLED) in backend/.env.');
  process.exit(1);
}

const db = drizzle({ connection: { connectionString }, schema, casing: 'snake_case' });

/** A calendar day `offset` days from today, as `YYYY-MM-DD`. */
function day(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** `offset` days from today at `hour`:00 UTC. */
function at(offset: number, hour: number): Date {
  return new Date(`${day(offset)}T${String(hour).padStart(2, '0')}:00:00Z`);
}

/** Creates the user, or resets an existing one; either way with a credential account. */
async function upsertUser(tx: Transaction, { name, email }: { name: string; email: string }) {
  const password = await hashPassword(PASSWORD);
  const [existing] = await tx
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email));

  const id = existing?.id ?? randomUUID();
  if (existing) {
    await tx.update(schema.user).set({ name, emailVerified: true }).where(eq(schema.user.id, id));
  } else {
    await tx.insert(schema.user).values({ id, name, email, emailVerified: true });
  }

  const credential = and(
    eq(schema.account.userId, id),
    eq(schema.account.providerId, 'credential'),
  );
  const [account] = await tx
    .select({ id: schema.account.id })
    .from(schema.account)
    .where(credential);
  if (account) {
    await tx.update(schema.account).set({ password }).where(eq(schema.account.id, account.id));
  } else {
    await tx.insert(schema.account).values({
      id: randomUUID(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password,
    });
  }
  // Old sessions may point at the seed organization deleted below: sign in again after seeding.
  await tx.delete(schema.session).where(eq(schema.session.userId, id));
  return id;
}

/** Deletes the seed organization; its members, events, tasks and labels cascade. */
async function deleteSeedOrganization(tx: Transaction) {
  const [org] = await tx
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.slug, ORG_SLUG));
  if (!org) return;

  const events = await tx
    .select({ id: schema.event.id })
    .from(schema.event)
    .where(eq(schema.event.organizationId, org.id));
  const eventIds = events.map((e) => e.id);

  // History and email log don't cascade (they outlive what they describe), so clear them first.
  for (const table of [schema.activityLog, schema.emailDelivery]) {
    await tx
      .delete(table)
      .where(
        eventIds.length > 0
          ? or(eq(table.organizationId, org.id), inArray(table.eventId, eventIds))
          : eq(table.organizationId, org.id),
      );
  }
  await tx.delete(schema.organization).where(eq(schema.organization.id, org.id));
}

async function seed(tx: Transaction) {
  await deleteSeedOrganization(tx);
  const ownerId = await upsertUser(tx, USERS.owner);
  const memberId = await upsertUser(tx, USERS.member);

  const organizationId = randomUUID();
  await tx.insert(schema.organization).values({
    id: organizationId,
    name: 'Chiro Sint-Jan (seed)',
    slug: ORG_SLUG,
    createdAt: new Date(),
    category: 'youth_movement',
    legalForm: 'de_facto_association',
    description: 'Testorganisatie uit pnpm db:seed.',
    foundingYear: 1962,
    street: 'Kerkstraat',
    houseNumber: '12',
    postalCode: '9000',
    city: 'Gent',
    country: 'BE',
  });

  // An old join date: a new login starts in the user's oldest organization, so this makes the
  // seed organization the active one even when the user has others.
  const joinedAt = new Date('2000-01-01T00:00:00Z');
  await tx.insert(schema.member).values([
    { id: randomUUID(), organizationId, userId: ownerId, role: 'owner', createdAt: joinedAt },
    { id: randomUUID(), organizationId, userId: memberId, role: 'member', createdAt: joinedAt },
  ]);

  const startsAt = at(24, 13); // 14:00 in Brussels (winter time)
  const year = startsAt.getUTCFullYear();

  const [previous] = await tx
    .insert(schema.event)
    .values({
      organizationId,
      name: `Kerstmarkt ${year - 1}`,
      eventType: 'market',
      description: 'Kerstmarkt op het kerkplein met kraampjes, glühwein en een kerstman.',
      location: 'Kerkplein, Gent',
      startsAt: at(24 - 365, 13),
      endsAt: at(24 - 365, 22),
      status: 'completed',
      expectedAttendance: 600,
      actualAttendance: 720,
      retrospective:
        'Glühwein was om 19u op: dubbele voorraad bestellen. Kassa had te weinig wisselgeld. ' +
        'Opbouw startte te laat, volgend jaar de tenten de avond ervoor zetten.',
    })
    .returning({ id: schema.event.id });

  const [kerstmarkt] = await tx
    .insert(schema.event)
    .values({
      organizationId,
      name: `Kerstmarkt ${year}`,
      eventType: 'market',
      description: 'Kerstmarkt op het kerkplein met kraampjes, glühwein en een kerstman.',
      location: 'Kerkplein, Gent',
      startsAt,
      endsAt: at(24, 22),
      status: 'published',
      previousEditionId: previous!.id,
      expectedAttendance: 800,
      // Made two months ago, so the countdown shows how much of the run-up is behind us.
      createdAt: at(-60, 9),
      // The tents go up the evening before (last year's lesson).
      setupStartsAt: at(23, 17),
      teardownEndsAt: at(24, 23),
      shiftsPerVolunteer: 1,
      publicSlug: `kerstmarkt-${year}-seed`,
      registrationOpen: true,
      registrationDeadline: at(17, 22),
    })
    .returning({ id: schema.event.id });
  const eventId = kerstmarkt!.id;

  const labels = await tx
    .insert(schema.label)
    .values([
      { eventId, name: 'Bar', color: 'orange' },
      { eventId, name: 'Kassa', color: 'green' },
      { eventId, name: 'Opbouw', color: 'blue' },
      { eventId, name: 'Promotie', color: 'purple' },
    ])
    .returning({ id: schema.label.id, name: schema.label.name });
  const label = (name: string) => labels.find((l) => l.name === name)!.id;

  type SeedTask = Omit<typeof schema.task.$inferInsert, 'eventId' | 'createdByUserId'> & {
    labels: string[];
  };
  const tasks: SeedTask[] = [
    {
      title: 'Glühwein en drank bestellen',
      description: 'Dubbele voorraad glühwein t.o.v. vorig jaar (was om 19u op).',
      status: 'in_progress',
      priority: 'high',
      dueDate: day(7),
      assigneeUserId: ownerId,
      labels: ['Bar'],
    },
    {
      title: 'Affiches ophangen in de buurt',
      status: 'todo',
      priority: 'medium',
      dueDate: day(-2), // overdue
      assigneeUserId: memberId,
      labels: ['Promotie'],
    },
    {
      title: 'Facebook-evenement aanmaken',
      status: 'done',
      priority: 'low',
      dueDate: day(-10),
      assigneeUserId: memberId,
      labels: ['Promotie'],
    },
    {
      title: 'Wisselgeld ophalen bij de bank',
      description: 'Minstens €300 in muntjes en briefjes van €5.',
      status: 'todo',
      priority: 'high',
      dueDate: day(22),
      labels: ['Kassa'],
    },
    {
      title: 'Tenten opzetten',
      description: 'De avond voordien, zie retrospectief van vorig jaar.',
      status: 'todo',
      priority: 'medium',
      dueDate: day(23),
      labels: ['Opbouw'],
    },
    {
      title: 'Kerstman regelen',
      status: 'in_progress',
      priority: 'medium',
      dueDate: day(14),
      assigneeName: 'Nonkel Jos',
      labels: [],
    },
    {
      title: 'Vergunning aanvragen bij de stad',
      status: 'done',
      priority: 'high',
      dueDate: day(-20),
      assigneeUserId: ownerId,
      labels: [],
    },
    {
      title: 'Kraampjes verdelen onder de standhouders',
      status: 'todo',
      priority: 'low',
      labels: ['Opbouw', 'Kassa'],
    },
  ];

  const inserted = await tx
    .insert(schema.task)
    .values(tasks.map(({ labels: _labels, ...t }) => ({ ...t, eventId, createdByUserId: ownerId })))
    .returning({ id: schema.task.id, title: schema.task.title });
  const taskId = (title: string) => inserted.find((t) => t.title === title)!.id;

  const links = tasks.flatMap((t) => t.labels.map((name) => ({ title: t.title, name })));
  await tx
    .insert(schema.taskLabelLink)
    .values(links.map(({ title, name }) => ({ taskId: taskId(title), labelId: label(name) })));

  // The member asked for an unassigned task: something for the owner to approve or decline.
  await tx
    .insert(schema.taskAssignmentRequest)
    .values({ taskId: taskId('Tenten opzetten'), userId: memberId });

  // The budget shares the event's labels; two more that only budget lines use.
  const budgetLabels = await tx
    .insert(schema.label)
    .values([
      { eventId, name: 'Sponsoring', color: 'teal' },
      { eventId, name: 'Huur', color: 'yellow' },
    ])
    .returning({ id: schema.label.id, name: schema.label.name });
  const anyLabel = (name: string) => [...labels, ...budgetLabels].find((l) => l.name === name)!.id;

  const supplierId = await insertSuppliers(tx, organizationId, ownerId);

  await insertBudget(tx, eventId, ownerId, anyLabel, taskId, supplierId, [
    // Income: some still estimated only, some already in.
    {
      type: 'income',
      title: 'Standgeld kraampjes',
      estimated: 180000,
      actual: 165000,
      labels: ['Kassa'],
      task: 'Kraampjes verdelen onder de standhouders',
    },
    {
      type: 'income',
      title: 'Verkoop glühwein en drank',
      estimated: 320000,
      actual: null,
      labels: ['Bar'],
    },
    {
      type: 'income',
      title: 'Sponsoring bakkerij Van Damme',
      estimated: 25000,
      actual: 25000,
      labels: ['Sponsoring'],
      supplier: 'Bakkerij Van Damme',
      notes: 'Logo op de affiche in ruil.',
    },
    {
      type: 'income',
      title: 'Subsidie stad Gent',
      estimated: 50000,
      actual: null,
      labels: ['Sponsoring'],
    },
    { type: 'income', title: 'Tombola', estimated: null, actual: 31250, labels: ['Kassa'] },
    // Expenses: one over budget, one under, one not paid yet.
    {
      type: 'expense',
      title: 'Glühwein en drank',
      estimated: 145000,
      actual: 138765,
      labels: ['Bar'],
      supplier: 'Drankenhandel Peeters',
      task: 'Glühwein en drank bestellen',
      notes: 'Dubbele voorraad t.o.v. vorig jaar.',
    },
    {
      type: 'expense',
      title: 'Tenten huren',
      estimated: 90000,
      actual: null,
      labels: ['Huur', 'Opbouw'],
      supplier: 'Tentenverhuur Ardenne',
      task: 'Tenten opzetten',
    },
    {
      type: 'expense',
      title: 'Affiches drukken',
      estimated: 12000,
      actual: 13420,
      labels: ['Promotie'],
      supplier: 'Drukkerij Vanden Broele',
      task: 'Affiches ophangen in de buurt',
    },
    {
      type: 'expense',
      title: 'Kerstmanpak huren',
      estimated: 4500,
      actual: null,
      labels: ['Huur'],
      supplier: 'Feestkledij Lieve',
      task: 'Kerstman regelen',
    },
    {
      type: 'expense',
      title: 'Vergunning stad',
      estimated: 7500,
      actual: 7500,
      labels: [],
      task: 'Vergunning aanvragen bij de stad',
    },
    {
      type: 'expense',
      title: 'Verlichting en elektriciteit',
      estimated: 18000,
      actual: null,
      labels: ['Opbouw'],
      supplier: 'Klank & Licht Decock',
    },
  ]);

  await insertPlanning(tx, organizationId, eventId, ownerId);

  // Last year's tasks: all done but one that was forgotten, for the overview's wrap-up.
  await tx.insert(schema.task).values([
    {
      eventId: previous!.id,
      title: 'Glühwein bestellen',
      status: 'done',
      priority: 'high',
      assigneeUserId: ownerId,
      createdByUserId: ownerId,
    },
    {
      eventId: previous!.id,
      title: 'Bedankkaartje naar de sponsors sturen',
      status: 'todo',
      priority: 'low',
      assigneeUserId: memberId,
      createdByUserId: ownerId,
    },
  ]);

  // A brand-new event: no tasks, planning or budget yet. The overview's empty states (and Mila
  // offering to set up the tasks).
  await tx.insert(schema.event).values({
    organizationId,
    name: `Spaghettiavond ${year + 1}`,
    eventType: 'meal',
    location: 'Parochiezaal Sint-Jan, Gent',
    startsAt: at(75, 17),
    endsAt: at(75, 22),
    status: 'draft',
    expectedAttendance: 250,
  });

  // Last year's budget, settled: every line has its actual amount.
  const previousLabels = await tx
    .insert(schema.label)
    .values([
      { eventId: previous!.id, name: 'Bar', color: 'orange' },
      { eventId: previous!.id, name: 'Kassa', color: 'green' },
      { eventId: previous!.id, name: 'Huur', color: 'yellow' },
    ])
    .returning({ id: schema.label.id, name: schema.label.name });
  const previousLabel = (name: string) => previousLabels.find((l) => l.name === name)!.id;
  await insertBudget(tx, previous!.id, ownerId, previousLabel, () => undefined, supplierId, [
    {
      type: 'income',
      title: 'Standgeld kraampjes',
      estimated: 150000,
      actual: 157500,
      labels: ['Kassa'],
    },
    {
      type: 'income',
      title: 'Verkoop glühwein en drank',
      estimated: 250000,
      actual: 212040,
      labels: ['Bar'],
      notes: 'Om 19u uitverkocht.',
    },
    {
      type: 'expense',
      title: 'Glühwein en drank',
      estimated: 80000,
      actual: 78230,
      labels: ['Bar'],
      supplier: 'Drankenhandel Peeters',
    },
    {
      type: 'expense',
      title: 'Tenten huren',
      estimated: 85000,
      actual: 85000,
      labels: ['Huur'],
      supplier: 'Tentenverhuur Ardenne',
    },
    {
      type: 'expense',
      title: 'Affiches drukken',
      estimated: 10000,
      actual: 11980,
      labels: [],
      supplier: 'Drukkerij De Kopie',
      notes: 'Te laat geleverd: dit jaar een andere drukker.',
    },
  ]);
}

/**
 * The Kerstmarkt's volunteers: three teams with shifts (setup the evening before, bar and cash
 * desk on the day), and volunteers who signed up. Some are placed and confirmed, some only
 * proposed, a few still wait for a shift: the planning card shows it partly filled.
 */
async function insertPlanning(
  tx: Transaction,
  organizationId: string,
  eventId: string,
  assignedByUserId: string,
) {
  const teams = await tx
    .insert(schema.team)
    .values([
      { eventId, name: 'Bar', defaultMeetingPoint: 'Achter de toog' },
      { eventId, name: 'Kassa', defaultMeetingPoint: 'Kassahokje aan de ingang' },
      { eventId, name: 'Opbouw', defaultMeetingPoint: 'Kerkplein' },
    ])
    .returning({ id: schema.team.id, name: schema.team.name });
  const teamId = (name: string) => teams.find((t) => t.name === name)!.id;

  const shiftSpecs = [
    { key: 'opbouw', team: 'Opbouw', startsAt: at(23, 17), endsAt: at(23, 20), capacity: 6 },
    { key: 'bar-early', team: 'Bar', startsAt: at(24, 13), endsAt: at(24, 17), capacity: 4 },
    { key: 'bar-late', team: 'Bar', startsAt: at(24, 17), endsAt: at(24, 22), capacity: 4 },
    { key: 'kassa-early', team: 'Kassa', startsAt: at(24, 13), endsAt: at(24, 17), capacity: 2 },
    { key: 'kassa-late', team: 'Kassa', startsAt: at(24, 17), endsAt: at(24, 22), capacity: 2 },
  ];
  const shifts = await tx
    .insert(schema.shift)
    .values(
      shiftSpecs.map(({ team, startsAt, endsAt, capacity }) => ({
        eventId,
        teamId: teamId(team),
        meetingPoint: null,
        startsAt,
        endsAt,
        capacity,
      })),
    )
    .returning({ id: schema.shift.id });
  const shiftId = (key: string) => shifts[shiftSpecs.findIndex((spec) => spec.key === key)]!.id;

  // [name, available shifts, preferred team, placed on (shift, status)]
  const people: [string, string[], string | null, [string, 'proposed' | 'confirmed'] | null][] = [
    ['Emma Claes', ['bar-early', 'bar-late'], 'Bar', ['bar-early', 'confirmed']],
    ['Noah Wouters', ['bar-late'], 'Bar', ['bar-late', 'confirmed']],
    ['Louise Jacobs', ['kassa-early', 'kassa-late'], 'Kassa', ['kassa-early', 'confirmed']],
    ['Arthur Maes', ['opbouw'], 'Opbouw', ['opbouw', 'confirmed']],
    ['Marie Mertens', ['opbouw', 'bar-early'], null, ['opbouw', 'confirmed']],
    ['Jules Willems', ['bar-early', 'kassa-early'], 'Bar', ['bar-early', 'proposed']],
    ['Olivia Goossens', ['kassa-late'], 'Kassa', ['kassa-late', 'proposed']],
    ['Lucas Dubois', ['opbouw'], 'Opbouw', ['opbouw', 'proposed']],
    ['Elena Hermans', ['bar-late', 'kassa-late'], null, ['bar-late', 'proposed']],
    ['Victor Lambert', ['bar-early', 'bar-late'], 'Bar', null],
    ['Nora De Smet', ['opbouw'], 'Opbouw', null],
    ['Finn Aerts', ['kassa-early'], 'Kassa', null],
  ];
  for (const [name, available, preferred, placement] of people) {
    const [volunteer] = await tx
      .insert(schema.volunteer)
      .values({
        organizationId,
        name,
        email: `${name.toLowerCase().replaceAll(' ', '.')}@voorbeeld.test`,
      })
      .returning({ id: schema.volunteer.id });
    const [application] = await tx
      .insert(schema.volunteerApplication)
      .values({
        eventId,
        volunteerId: volunteer!.id,
        source: 'public',
        availableShiftIds: available.map(shiftId),
        preferredTeamId: preferred ? teamId(preferred) : null,
        consentedAt: at(-20, 10),
      })
      .returning({ id: schema.volunteerApplication.id });
    if (placement) {
      await tx.insert(schema.assignment).values({
        applicationId: application!.id,
        shiftId: shiftId(placement[0]),
        status: placement[1],
        assignedByUserId,
      });
    }
  }
}

interface SeedBudgetLine {
  type: 'income' | 'expense';
  title: string;
  /** Euro cents. */
  estimated: number | null;
  actual: number | null;
  labels: string[];
  task?: string;
  /** The supplier's name. */
  supplier?: string;
  notes?: string;
}

/**
 * The organization's suppliers, in every category the budget uses: a printer that was dropped
 * after last year (archived) and a sanitation company nobody used yet. Returns a lookup by name.
 */
async function insertSuppliers(tx: Transaction, organizationId: string, createdByUserId: string) {
  const rows = await tx
    .insert(schema.supplier)
    .values(
      (
        [
          {
            name: 'Drankenhandel Peeters',
            category: 'drinks',
            contactName: 'Koen Peeters',
            email: 'bestellingen@drankenhandelpeeters.be',
            phone: '09 228 14 70',
            website: 'https://www.drankenhandelpeeters.be',
            notes: 'Levert op vrijdag voor 14u. Leeggoed wordt maandag opgehaald.',
          },
          {
            name: 'Bakkerij Van Damme',
            category: 'food',
            contactName: 'Els Van Damme',
            email: 'els@bakkerijvandamme.be',
            phone: '09 225 33 81',
            notes: 'Sponsort elk jaar in ruil voor een logo op de affiche.',
          },
          {
            name: 'Tentenverhuur Ardenne',
            category: 'tents_and_furniture',
            contactName: 'Marc Lambert',
            email: 'info@tentenardenne.be',
            phone: '+32 475 12 34 56',
            website: 'https://tentenardenne.be',
            notes: 'Opbouw door hun ploeg, wij leveren 4 helpers.',
          },
          {
            name: 'Klank & Licht Decock',
            category: 'sound_and_light',
            contactName: 'Pieter Decock',
            email: 'pieter@klankenlichtdecock.be',
            phone: '0496 55 21 09',
          },
          {
            name: 'Drukkerij Vanden Broele',
            category: 'printing',
            email: 'offerte@vandenbroele.be',
            website: 'https://www.vandenbroele.be',
          },
          {
            name: 'Drukkerij De Kopie',
            category: 'printing',
            phone: '09 233 40 12',
            notes: 'Affiches vorig jaar te laat geleverd.',
            archivedAt: at(-200, 10),
          },
          {
            name: 'Feestkledij Lieve',
            category: 'rental',
            contactName: 'Lieve Martens',
            phone: '0479 88 10 42',
          },
          {
            name: 'Toiletwagens Vermeulen',
            category: 'sanitation',
            website: 'https://www.toiletwagensvermeulen.be',
            notes: 'Offerte gevraagd voor de zomerbar.',
          },
        ] satisfies Omit<
          typeof schema.supplier.$inferInsert,
          'organizationId' | 'createdByUserId'
        >[]
      ).map((values) => ({ ...values, organizationId, createdByUserId })),
    )
    .returning({ id: schema.supplier.id, name: schema.supplier.name });
  return (name: string) => rows.find((row) => row.name === name)!.id;
}

/**
 * Budget lines with their labels. `createdAt` is spread over the past days in list order, so
 * "newest first" shows the last line on top.
 */
async function insertBudget(
  tx: Transaction,
  eventId: string,
  createdByUserId: string,
  labelId: (name: string) => string,
  taskId: (title: string) => string | undefined,
  supplierId: (name: string) => string,
  lines: SeedBudgetLine[],
) {
  const entries = await tx
    .insert(schema.budgetEntry)
    .values(
      lines.map((line, index) => ({
        eventId,
        createdByUserId,
        type: line.type,
        title: line.title,
        estimatedCents: line.estimated,
        actualCents: line.actual,
        notes: line.notes ?? null,
        taskId: line.task ? (taskId(line.task) ?? null) : null,
        supplierId: line.supplier ? supplierId(line.supplier) : null,
        createdAt: at(index - lines.length, 9),
      })),
    )
    .returning({ id: schema.budgetEntry.id });
  const links = lines.flatMap((line, index) =>
    line.labels.map((name) => ({ budgetEntryId: entries[index]!.id, labelId: labelId(name) })),
  );
  if (links.length > 0) await tx.insert(schema.budgetEntryLabelLink).values(links);
}

try {
  await db.transaction(seed);
  console.log('Seeded. Sign in with (password Hallo1234):');
  console.log(`  owner   ${USERS.owner.email}`);
  console.log(`  member  ${USERS.member.email}`);
} finally {
  await db.$client.end();
}
