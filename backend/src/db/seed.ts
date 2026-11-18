/**
 * Fills the dev database with a known state to click through features:
 *
 *   pnpm db:seed
 *
 * - Owner:  mateogheeraert04@gmail.com / Hallo1234
 * - Member: lid@volunteeros.test       / Hallo1234
 * - Organization "Chiro Sint-Jan (seed)" with the event "Kerstmarkt 2026" (labels, tasks in every
 *   status, an overdue task, a pending assignment request) and its previous edition.
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
    })
    .returning({ id: schema.event.id });
  const eventId = kerstmarkt!.id;

  const labels = await tx
    .insert(schema.taskLabel)
    .values([
      { eventId, name: 'Bar', color: 'orange' },
      { eventId, name: 'Kassa', color: 'green' },
      { eventId, name: 'Opbouw', color: 'blue' },
      { eventId, name: 'Promotie', color: 'purple' },
    ])
    .returning({ id: schema.taskLabel.id, name: schema.taskLabel.name });
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
}

try {
  await db.transaction(seed);
  console.log('Seeded. Sign in with (password Hallo1234):');
  console.log(`  owner   ${USERS.owner.email}`);
  console.log(`  member  ${USERS.member.email}`);
} finally {
  await db.$client.end();
}
