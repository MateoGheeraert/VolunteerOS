# VolunteerOS frontend

Next.js 16 (App Router, Cache Components, Partial Prefetching), React 19, Tailwind v4, shadcn/ui (Radix, "Maia" preset, restyled). Product decisions: [docs/info.md](../docs/info.md).

> Next.js 16 differs from older versions (for example `proxy.ts` replaces `middleware.ts`, and request data must sit behind `<Suspense>`). Its docs ship in `node_modules/next/dist/docs/`; read them before changing routing or caching.

## How it reaches the backend

Browsers only ever talk to Next.js. Nest is private. Everything that talks to Nest lives in `src/server/` (server-only; a lint rule forbids SDK imports anywhere else).

| Path                                 | What                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `src/server/api.ts`                  | Runtime config of the generated SDK: adds cookie, client IP and `X-Internal-Secret`; throws `ApiError`. |
| `src/server/query.ts`                | `query(sdkCall())` for reads: API errors become login, onboarding, forbidden or not-found pages.        |
| `src/server/action-client.ts`        | `actionClient` (next-safe-action) for writes: validates input, turns every failure into a form error.   |
| `src/server/<feature>/queries.ts`    | Reads (`getX`, `listX`).                                                                                |
| `src/server/<feature>/actions.ts`    | Writes (`createX`, `updateX`, …), `'use server'` once at the top.                                       |
| `src/server/auth.ts`                 | Server-side Better Auth reads (session, organizations, invitation), validated with Zod.                 |
| `src/app/api/auth/[...all]/route.ts` | Forwards `/api/auth/*` to Nest with the secret, so the session cookie is first-party on this origin.    |
| `src/lib/auth-client.ts`             | Better Auth browser client (sign-in/up, organization switching, invitations).                           |
| `src/proxy.ts`                       | Redirects to `/login` when there is no session cookie. Convenience only: Nest authorizes everything.    |

Adding a feature:

```ts
// src/features/tasks/schemas.ts: shared by the form and the action; messages are translation keys
export const taskFormSchema = z.object({
  title: z.string().min(1, msg('taskForm.validation.titleRequired')),
});

// src/server/tasks/queries.ts
export const listTasks = (eventId: string) => query(tasksControllerList({ path: { eventId } }));

// src/server/tasks/actions.ts
('use server');
export const createTask = actionClient
  .metadata({ name: 'createTask' })
  .bindArgsSchemas([z.uuid()])
  .inputSchema(taskFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    const { data } = await tasksControllerCreate({ path: { eventId }, body: parsedInput });
    revalidatePath(`/events/${eventId}`, 'layout');
    return { id: data.id };
  });

// a client component
const { form, onSubmit, formError, pending } = useActionForm(
  createTask.bind(null, eventId),
  taskFormSchema,
  {
    defaultValues: { title: '' },
    onSuccess: () => toast.success(t('tasks.created')),
  },
);
```

## Typed client and contract checks

`pnpm api:generate` runs `@hey-api/openapi-ts` on `../backend/openapi.json` and writes the SDK and Zod schemas to `src/api/generated/` (gitignored). It runs automatically before `dev`, `build` and `typecheck`. When the backend API changes: run `pnpm openapi:export` in `backend/`, then `pnpm api:generate` here.

- A breaking change (renamed or new required field) fails `tsc`, locally and in CI.
- At runtime every SDK call validates its request body and response against the generated schemas; a mismatch is logged as an API contract violation.

## Theme

All brand colors are one block of variables at the top of `src/app/globals.css`. Change the look there; everything else points at those variables. Status colors (ok, warn, bad) are separate on purpose. Light mode only for the MVP.

## i18n and time

Dutch (`nl-BE`) only, no locale in URLs. Every UI string is in `src/messages/nl.json`, and keys are type-checked. Events are in `Europe/Brussels`: `src/lib/format.ts` converts form input to UTC and formats dates and money.

## Scripts

| Script           | What                                                                              |
| ---------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`       | Dev server on http://localhost:3000 (needs Nest running and `.env`)               |
| `pnpm build`     | Production build (`output: 'standalone'`, used by the Dockerfile)                 |
| `pnpm lint`      | oxlint, type-aware                                                                |
| `pnpm typecheck` | Route types + `tsc`                                                               |
| `pnpm test`      | Vitest unit tests in `test/unit/` (mirrors `src/`)                                |
| `pnpm e2e`       | Playwright tests in `test/e2e/` against running apps (`playwright install` first) |
