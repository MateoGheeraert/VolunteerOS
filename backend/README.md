# VolunteerOS backend

NestJS 12 API for VolunteerOS. It's a **private** service: browsers never call it. The Next.js server calls it, and forwards the user's session cookie. For product context and the reasoning behind these choices, see [docs/info.md](../docs/info.md).

| Concern       | Choice                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- |
| Runtime       | Node.js 24 LTS, ESM (`"type": "module"`, relative imports end in `.js`)                 |
| Framework     | NestJS 12, Express adapter                                                              |
| Database      | Neon Postgres, through Drizzle ORM (`@nestjs/drizzle`)                                  |
| Auth          | Better Auth (email + password, organization plugin)                                     |
| Authorization | Hand-written policies + guards in `src/authz`                                           |
| Validation    | Zod schemas derived from the Drizzle tables (`drizzle-zod`), validated natively by Nest |
| API docs      | OpenAPI generated from the same Zod schemas (`@nestjs/swagger`)                         |
| Email         | Resend (printed to the console in development without an API key)                       |
| Tests         | Vitest + Supertest, Postgres in Docker via Testcontainers                               |
| Lint          | oxlint, with type-aware rules (e.g. no floating promises)                               |
| CI            | GitHub Actions, see [CI](#ci)                                                           |

## Getting started

### 1. Neon branches

| Branch       | Used by                | Notes                          |
| ------------ | ---------------------- | ------------------------------ |
| `production` | the deployed app       | Never point local tools at it. |
| `dev`        | `pnpm dev`, migrations | Branched from `production`.    |

Tests don't use Neon: they start their own Postgres in Docker (see [Tests](#tests)).

Each branch has two connection strings in the Neon console:

- **Pooled** (host contains `-pooler`): for the running app (`DATABASE_URL`).
- **Direct**: for migrations (`DATABASE_URL_UNPOOLED`). Neon's pooler runs in transaction mode, which migrations don't work well with.

### 2. Environment

```bash
cp .env.example .env
```

Fill in:

- `DATABASE_URL`, `DATABASE_URL_UNPOOLED`: the `dev` branch (pooled and direct).
- `BETTER_AUTH_SECRET`, `INTERNAL_API_SECRET`: generate each with
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  ```
  The frontend needs the same `INTERNAL_API_SECRET`.
- `RESEND_API_KEY`: optional in development (emails are printed to the console), required in production.

All variables are validated at startup in [src/config/env.ts](src/config/env.ts). The app refuses to start with a missing or invalid one and tells you which.

### 3. Install, migrate, run

From the repository root:

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

The API listens on http://127.0.0.1:4000. Every request needs the `x-internal-secret` header (only `GET /api/health` is exempt), so for manual testing:

```bash
curl -H "x-internal-secret: <INTERNAL_API_SECRET>" http://127.0.0.1:4000/api/events
```

OpenAPI docs (outside production): `/api/docs`, JSON at `/api/openapi.json`.

## Scripts

Run from `backend/`, or from the root with `pnpm --filter @volunteeros/backend <script>`.

| Script                | What it does                                                                |
| --------------------- | --------------------------------------------------------------------------- |
| `pnpm dev`            | Starts the API in watch mode, with `.env` loaded.                           |
| `pnpm build`          | Compiles to `dist/`.                                                        |
| `pnpm start`          | Runs the compiled app.                                                      |
| `pnpm typecheck`      | Type-checks without emitting.                                               |
| `pnpm lint`           | Lints `src` and `test` with oxlint (type-aware).                            |
| `pnpm test`           | Unit + integration tests.                                                   |
| `pnpm test:unit`      | Unit tests only (no database needed).                                       |
| `pnpm test:int`       | Integration tests (needs Docker running).                                   |
| `pnpm db:generate`    | Writes a SQL migration from schema changes.                                 |
| `pnpm db:migrate`     | Applies pending migrations to `DATABASE_URL_UNPOOLED`.                      |
| `pnpm db:studio`      | Opens Drizzle Studio on the dev branch.                                     |
| `pnpm auth:schema`    | Regenerates the Better Auth tables in `src/db/schema/auth.ts`.              |
| `pnpm openapi:export` | Writes `openapi.json`. Commit it: the frontend client is generated from it. |

## Database migrations

The schema lives in TypeScript in `src/db/schema/`. Migrations are SQL files generated from it and **committed** in `src/db/migrations/`.

1. Change the schema in `src/db/schema/*.ts`.
2. `pnpm db:generate --name <what-changed>` writes a new SQL file. Read it before committing: renames, for example, can come out as drop + add.
3. `pnpm db:migrate` applies it to the dev branch.
4. Commit the schema change and the migration together.

Rules:

- Never use `drizzle-kit push`: it changes the database without a migration file, so production would drift from the repository.
- Never edit a migration that has already been applied anywhere. Write a new one.
- `src/db/schema/auth.ts` is generated by Better Auth. Don't edit it by hand: after adding or changing a Better Auth plugin, run `pnpm auth:schema`, then `pnpm db:generate`.
- The integration tests apply all migrations to a fresh Docker Postgres at the start of every run, so a broken migration fails the tests.

Neon branches make risky migrations cheap to rehearse: branch from `production`, run `pnpm db:migrate` against the new branch, and check the result before migrating production.

## How the code is structured

```text
src/
├── main.ts                 Boots Nest (bodyParser off: Better Auth reads raw bodies)
├── app.module.ts           Root module: wires every module below
├── app.setup.ts            Middleware order, shared by main.ts and the tests
├── config/                 Env validation (Zod) → injectable ENV
├── db/
│   ├── database.module.ts  Drizzle connection (@nestjs/drizzle)
│   ├── database.ts         The `Database`, `Transaction` and `DbExecutor` types
│   ├── soft-delete.ts      `deletedAt()` column and `notDeleted(table)` filter
│   ├── schema/             Tables: auth.ts (generated), events.ts, activity-log.ts, index.ts
│   └── migrations/         Generated SQL, committed
├── activity/               recordActivity() and the Actor type (see "Activity log")
├── auth/                   Better Auth instance + its activity hooks, AuthGuard, @Public(), @CurrentUser()
├── authz/                  Org context, policies, guards, decorators
├── email/                  EmailService (console / Resend) and templates
├── common/                 Health check, internal-secret middleware, date schemas
├── openapi-export.ts       Writes openapi.json (`pnpm openapi:export`)
└── features/
    └── events/             schemas → controller → service → repository (+ unit tests)
test/                       Integration tests and helpers
openapi.json                The API contract: generated, committed, checked by CI
```

### What a request goes through

```text
Next.js server ──► internal-secret middleware ─┬─► /api/auth/*  Better Auth handles it directly
                                               └─► JSON body parser
                                                   └─► AuthGuard (global)        401 without a session
                                                       └─► OrgGuard (@OrgScoped) 403 without an active org membership
                                                           └─► EventAccessGuard  404 hidden / 403 forbidden
                                                               └─► validation pipe (Zod)  400
                                                                   └─► controller → service → repository
```

1. **Internal secret** ([internal-secret.middleware.ts](src/common/internal-secret.middleware.ts)): rejects any request without the `x-internal-secret` header (403). It's an extra layer on top of the private network, not a replacement for auth.
2. **Better Auth** owns `/api/auth/*`: sign-up, sign-in, sessions, organizations, invitations. Its endpoints are documented in the [Better Auth docs](https://www.better-auth.com/docs/plugins/organization), not in our OpenAPI.
3. **AuthGuard** ([auth.guard.ts](src/auth/auth.guard.ts)) is global: every route needs a session unless it's marked `@Public()`.
4. **OrgGuard** ([org.guard.ts](src/authz/org.guard.ts)) runs on `@OrgScoped()` controllers. It takes the session's active organization, checks the user is a member of it, and puts `{ userId, organizationId, role, actor }` on the request (`@CurrentOrg()`). `actor` is who the [activity log](#activity-log) records.
5. **EventAccessGuard** runs on routes marked `@RequireEventAccess('read' | 'manage' | 'manageMembers')`. It loads the `:eventId` event within the active organization and checks the policy. The loaded event is available as `@CurrentEvent()`.
6. **Validation**: `@Body({ schema })` validates with the feature's Zod schema; invalid input gets a 400.

### Permissions

The rules live in one file of plain functions: [src/authz/policies.ts](src/authz/policies.ts).

| Organization role                     | Events                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `owner`, `admin` (Organization Admin) | Everything in the organization, including assigning managers                               |
| `member` (organizer)                  | Creates events; reads and manages the ones they're assigned to as manager (`event_member`) |

- Events of another organization, and events a member isn't assigned to, answer **404**, so their existence doesn't leak.
- A visible event with a forbidden action (a manager assigning managers) answers **403**.
- **Tenant isolation is in the data layer too**: every repository method takes the `organizationId` it works in. Never query a tenant's table without it.

### API schemas come from the tables

A table is the single source of truth. Each feature has a `<feature>.schemas.ts` that derives its request and response schemas from the Drizzle table with [drizzle-zod](https://orm.drizzle.team/docs/zod), so column types, nullability and enum values aren't typed twice:

```text
Drizzle table → drizzle-zod → Zod schemas → request validation + openapi.json → frontend client (generated)
```

The schema file only adds what the table can't know:

- **Which fields a client may send**: a `.pick({ ... })`, so `id`, `organizationId` and timestamps are always set by the server.
- **Extra rules**: length limits, "ends after starts", allowed status values.
- **Dates**: the database has `Date` objects, JSON has strings. Requests use `dateTimeInput` (ISO-8601 with offset, parsed to a `Date`), responses `dateTimeOutput` ([src/common/schemas.ts](src/common/schemas.ts)).
- **A name**: `.meta({ id: 'CreateEvent' })`, so it becomes a named component in `openapi.json`.

See [events.schemas.ts](src/features/events/events.schemas.ts).

### Soft deletes

**Nothing is permanently deleted.** A deletion sets `deleted_at`; the row stays.

- Every feature table gets `deletedAt: deletedAt()` ([src/db/soft-delete.ts](src/db/soft-delete.ts)).
- **Every read filters with `notDeleted(table)`**, joins included. Drizzle has no global scope, so this is on the repository. It matters for security too: `EventAccessService` ignores removed `event_member` rows, otherwise a removed manager would keep access.
- A delete is an `update ... set deleted_at = now()`, logged as `deleted` (or a domain verb such as `member_removed`).
- Unique constraints that should only hold for live rows are partial: ``uniqueIndex(...).on(...).where(sql`deleted_at is null`)``. That way a removed manager can be assigned again, as a new row.
- API schemas `.omit({ deletedAt: true })`: deleted rows are never returned, so clients don't need the field.

Exceptions:

- **Better Auth tables** (`user`, `session`, `account`, `verification`, `member`, `invitation`, `organization`) follow Better Auth, which hard-deletes (removing a member deletes the `member` row). Its organization changes are recorded in the activity log, so the history survives.
- **Organizations can't be deleted** (`disableOrganizationDeletion`): it would cascade into everything they own.
- **GDPR erasure** (to be built): when a person asks to be forgotten, their personal data must really go. That workflow, and only that one, will anonymize or hard-delete personal data. Until it exists, don't add other hard deletes.

### Activity log

Every change is recorded in `activity_log` ([schema](src/db/schema/activity-log.ts)): who did it, what they did, to which record, and which fields changed. Admins use it to trace mistakes; the AI agent uses it as history.

| Column                        | What                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `organization_id`, `event_id` | Where it happened. `event_id` is null for organization-level changes (members, invites).   |
| `actor_type`, `actor_id`      | `user`, `volunteer`, `ai` (id = the agent) or `system` (no id). Plain text, no FK.         |
| `on_behalf_of_user_id`        | Only for `ai`: the user whose command the agent carried out.                               |
| `action`                      | `created`, `updated`, `deleted`, or a domain verb (`archived`, `member_added`, `invited`). |
| `entity_type`, `entity_id`    | The changed record, e.g. `event` + its id.                                                 |
| `changes`                     | `{ field: { from, to } }` for loggable values, `{ field: null }` for everything else.      |

Rules:

- **Written in the service, inside the same transaction as the change.** A rolled-back change leaves no entry, and a committed change always has one. No interceptors: only the service knows what changed.
- **No personal data.** Store IDs, never names, emails, phone numbers or free text. Fields are logged **by name only** unless the call lists them in `values`; only list fields that aren't personal (statuses, dates, IDs, event names).
- **Append-only.** Nothing updates or deletes log rows. The foreign keys don't cascade.
- An update that changes nothing writes no entry.

Logging a change is one call, with the transaction the change runs in:

```ts
const EVENT_LOGGED_VALUES = ['name', 'location', 'startsAt', 'endsAt', 'status'] as const;

await this.db.transaction(async (tx) => {
  const row = await this.events.update(tx, org.organizationId, current.id, input);
  await recordActivity(tx, org, {
    action: 'updated',
    entityType: 'event',
    entity: row,
    before: current, // a row: log what differs; null: a new row; left out: no field changes
    eventId: row.id,
    values: EVENT_LOGGED_VALUES,
  });
});
```

`org` is the `OrgContext` from `@CurrentOrg()`; its `actor` is the signed-in user. Code that runs outside a request (jobs, scripts) passes `{ organizationId, actor: SYSTEM_ACTOR }`.

**Better Auth changes** (organization created or renamed, members added, removed or given another role, invitations sent, accepted, rejected or cancelled) are logged from the organization plugin's hooks, in [auth.activity.ts](src/auth/auth.activity.ts). Two differences:

- They run after Better Auth has committed, so they **can't be in the same transaction**. If logging fails, the error is logged and the request still succeeds.
- The hooks pass the user acted _on_; the actor comes from the current request's session (`tryGetCurrentAuthEndpointContext()`). The invitee's email is stored by name only.

### Adding a feature

Follow `features/events/`:

1. **Table**: `src/db/schema/<feature>.ts`, exported from `schema/index.ts`, with a `deletedAt: deletedAt()` column. Then `pnpm db:generate`.
2. **Schemas**: `features/<feature>/<feature>.schemas.ts`, derived from the table (see above), with `deletedAt` omitted from responses.
3. **Repository**: all queries, each taking the `organizationId` (or an already-authorized event id) and filtering `notDeleted(...)`. Write methods take a `tx: DbExecutor`.
4. **Service**: business rules (status transitions, invariants). Pure rules go in their own file with a `.spec.ts`. Every write opens a transaction and calls `recordActivity` in it.
5. **Controller**: `@OrgScoped()`, `@RequireEventAccess(...)` on event routes, `@Body({ schema })`, and `@ApiResponse({ standardSchema })` for the docs.
6. **Module**: register it in `app.module.ts`.
7. **Tests**: rules in unit tests; HTTP behavior, organization isolation and the logged entries in `test/*.int.test.ts`.
8. **Contract**: `pnpm openapi:export`, and commit `openapi.json`.

Adding a column to an existing table: change the table, run `pnpm db:generate`, add the column to the `.pick` if clients may set it, and run `pnpm openapi:export`. CI fails if you forget the migration or the export.

## Tests

```bash
pnpm test         # everything
pnpm test:unit    # fast, no database
pnpm test:int     # needs Docker running
```

- **Unit tests** (`src/**/*.spec.ts`): pure functions such as policies and status transitions.
- **Integration tests** (`test/*.int.test.ts`): boot the real app through `app.setup.ts`, sign users up via Better Auth, and call the API over HTTP with a client that sends the internal secret, like the Next.js server does. Emails are captured instead of sent ([test-app.ts](test/test-app.ts)).
- **Database**: [global-setup.ts](test/global-setup.ts) starts a `postgres:17-alpine` container with [Testcontainers](https://node.testcontainers.org/) (same major version as Neon), applies the migrations, and passes the URL to the tests. The container is removed when the run ends, so nothing keeps running and nothing touches Neon. Docker Desktop must be running; the first run pulls the image.
- Tests truncate every table between tests, within that throwaway database.

## CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml) runs on every pull request and every push to `main`:

| Job                                      | Checks                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Format                                   | `prettier --check` on the whole repository                                                         |
| Backend · lint, types, unit tests, build | oxlint, `tsc`, unit tests, `nest build`, migrations match the schema, `openapi.json` is up to date |
| Backend · integration tests              | the integration tests, with Testcontainers on the runner's Docker                                  |
| Backend · Docker image builds            | `docker build` of the [Dockerfile](Dockerfile), without pushing                                    |

To run the same checks locally before pushing (from the repository root):

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

## Deployment

Build the image from the repository root:

```bash
docker build -f backend/Dockerfile -t volunteeros-backend .
```

The container listens on `0.0.0.0:4000` and must only be reachable on the private network shared with the Next.js app. In production, `RESEND_API_KEY` is required, and the OpenAPI docs are off.

Not done yet: running `db:migrate` as a release step. Pick that when the hosting provider is chosen.
