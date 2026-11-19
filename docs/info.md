# VolunteerOS — Project Context

> AI-assisted event management for community organizations.
>
> **Status:** Planning / Pre-development  
> **Version:** 0.1  
> **Last updated:** November 2026

---

## 1. Project Overview

### What is VolunteerOS?

VolunteerOS is an AI-assisted event operations platform designed for small and medium-sized community organizations.

It combines event planning, task management, volunteer coordination, budgets, and supplier management into one simple workspace.

The platform helps organizers replace scattered spreadsheets, Google Forms, WhatsApp messages, and disconnected planning tools.

AI assists organizers with volunteer allocation, planning, recurring events, and administrative work.

### Mission

Make organizing community events simpler, smarter, and less time-consuming.

### Product Vision

A single platform where organizations can:

- Create and manage events.
- Plan and assign preparation tasks.
- Recruit and coordinate volunteers.
- Automatically generate volunteer schedules.
- Track event budgets, expenses, and income.
- Manage suppliers and their historical costs.
- Reuse information from previous events.
- Receive intelligent AI-powered suggestions.

The platform should remain simple enough for volunteers and organizers without technical experience.

### Core Principle

**VolunteerOS should be useful without AI. AI enhances existing workflows rather than replacing them.**

---

## 2. Target Audience

### Primary Audience

Small and medium-sized volunteer-run organizations coordinating community events.

Examples:

- Youth movements (KLJ, Chiro, Scouts).
- Student associations.
- Local festival committees.
- Christmas market organizers.
- Charity and fundraising organizations.
- Community groups.
- Sports clubs organizing events.
- Nonprofit associations.

### Ideal Initial Customer

An organization that:

- Organizes approximately 2–12 events per year.
- Coordinates 10–100 volunteers for its larger events.
- Has several people responsible for planning.
- Currently uses spreadsheets, messaging apps, and documents.
- Needs help organizing volunteers, tasks, and expenses.
- Has limited budgets and technical knowledge.

These are initial targeting assumptions, not validated customer statistics.

### Initial Market

Belgium, particularly Flanders.

The first version should support Dutch and be designed for internationalization.

English can be added later.

### Potential Future Customers

- Larger volunteer organizations.
- Community festivals with hundreds of volunteers.
- Nonprofit event networks.
- Small professional event organizers.

Professional event management is NOT the initial target.

---

## 3. Product Positioning

### Main Differentiation

VolunteerOS combines several operational workflows into one easy-to-use platform:

1. Event planning.
2. Task management.
3. Volunteer registration and scheduling.
4. Budget tracking.
5. Supplier management.
6. AI-powered assistance.

The application is **event-first**, not an organization ERP system.

Every operational workflow revolves around an event.

### Unique Value Proposition

"Plan your event, organize your volunteers, manage your tasks and costs — all in one place."

### Long-Term Differentiator

**Event Memory**

Recurring events become easier to organize because VolunteerOS remembers:

- Previous tasks.
- Earlier volunteer requirements.
- Suppliers.
- Historical costs.
- Budgets.
- Organizational decisions.
- Problems and lessons learned.

AI uses this history to suggest improvements for future editions.

### Important Competitive Reality

Several individual features already exist in other platforms.

VolunteerOS should compete on simplicity, integration, ease of adoption, and continuity between events.

It should NOT claim that AI scheduling or account-free registration are entirely new inventions.

---

## 4. Product Structure

### Organization

An organization is the permanent workspace.

Contains:

- Organization name and details.
- Organization members.
- Roles and permissions.
- Events.
- Supplier directory.
- Reusable information.
- Organization settings.

One user can eventually belong to multiple organizations.

#### Organization profile

Creating an organization (onboarding) asks only for its **name** and **category**. Everything else is optional and filled in later under Settings → Organisatie.

| Field | Notes |
| --- | --- |
| Name | Required. Renaming never changes the internal slug. |
| Category | Required, fixed list: youth movement (Jeugdbeweging), sports club (Sportclub), culture (Cultuur), school / parents' committee (School/oudercomité), neighbourhood committee (Buurtcomité), charity (Goed doel), student association (Studentenvereniging), religious / philosophical (Levensbeschouwelijk), other (Andere). |
| Legal form | De facto association (feitelijke vereniging), vzw, ivzw, foundation (stichting), company (vennootschap), other. |
| Description, website, founding year | Website must be an http(s) URL (a bare domain gets `https://`); founding year is not in the future. |
| Enterprise number | Belgian ondernemingsnummer, stored as 10 digits, shown as `0123.456.789`, checked with mod 97. Many youth movements (de facto associations) have none. |
| Peppol ID | `scheme:identifier`. Prefilled as `0208:<enterprise number>` when an enterprise number is entered and no Peppol ID is set; editable. Not used yet (future invoicing). |
| Insurance | Insurer and policy number of the volunteers' liability insurance (Belgian volunteer law). |
| Registered address | Street, house number, box, postal code, city, country (ISO-2, default BE). Same shape as personal addresses. |

Owners and admins edit the profile; members see it read-only. Every change is written to the activity log with the old and new values (the profile describes the organization, not a person).

### Event

An event is the central operational entity.

Contains:

- General information.
- Event organizers.
- Teams.
- Tasks.
- Volunteer shifts.
- Volunteer applications.
- Volunteer assignments.
- Budget entries.
- Event suppliers.
- Event status.

Example:

Organization: KLJ Merkem

Events:

- Christmas Market 2026.
- Summer Barbecue 2027.
- Fundraising Quiz 2027.

### General Architecture Principle

Organization-level data should be reusable.

Event-specific data should belong to an event.

Example:

A beverage supplier belongs to the organization.

A specific beverage order, quoted amount, and actual expense belong to an event.

---

## 5. User Roles

### 5.1 Organization Admin

Authenticated user.

Can:

- Manage organization settings.
- Invite and remove organization members.
- Manage permissions.
- Create and manage events.
- Access all organization events.
- Manage organization suppliers.
- Access organization financial information.

### 5.2 Event Manager

Authenticated user.

Can:

- Manage assigned events.
- Create and update event tasks.
- Manage event volunteers.
- Create volunteer shifts.
- Generate and approve assignments.
- Publish volunteer schedules.
- Manage event budget entries.
- Manage event supplier associations.
- View event dashboards.

Access should be limited to assigned events unless additional permissions are granted.

### 5.3 Team Coordinator (P1)

Authenticated user.

Can:

- View assigned event teams.
- Manage relevant tasks.
- Manage relevant shifts.
- View assigned volunteers.
- Update operational information within the team.

Cannot manage organization-wide settings.

### 5.4 Volunteer

**No account required.**

Volunteers participate using:

- Public registration links.
- Email-based verification.
- Secure personal management links.

Can:

- Register for an event.
- Provide availability.
- Select preferred tasks or teams.
- Provide additional preferences.
- Receive assignment confirmations.
- View their own assignments.
- Request changes or cancellation (P1).

Volunteers must not be able to view other volunteers' private information.

---

## 6. Feature Priorities

Priorities:

- **P0:** MVP — essential functionality.
- **P1:** First major release.
- **P2:** Future functionality.

The priority reflects product importance, not necessarily implementation order.

---

## 7. P0 — MVP Features

### 7.1 Authentication and Organizations

Features:

- User registration and login.
- Create organization.
- Invite organization members by email.
- Admin and Event Manager roles.
- Event-level access permissions.
- Basic organization settings.
- Personal settings: name, email, password and profile.

Requirements:

- Multi-tenant data isolation.
- Secure authentication.
- Expiring and revocable invitations.
- Server-side authorization.

#### Personal settings (implemented)

"As an organizer, I want to change my name, email and password (and later delete my account), so that I control my own data."

`/settings` has three tabs: **Profiel** (`/settings/profile`), **Account** (`/settings/account`) and **Organisatie** (`/settings/organization`, the active organization's settings). The user menu links to it.

- **Profiel**: name, phone, address and birth date, each edited in place. Everything except the name is optional; a card on top (and a dot on the user menu) asks for what is still missing.
  - Phone: stored in E.164; numbers without a country code are read as Belgian (`0470 12 34 56` → `+32470123456`).
  - Address: structured (street, number, box, postal code, city, country as ISO code, default BE), saved as a whole. A Belgian postal code has four digits. No geocoding yet: proximity suggestions are a later AI story.
  - Birth date: anyone under 13 is refused (the Belgian age of digital consent under the GDPR). **Later rule, not built yet:** an unknown birth date will count as "minor" for age-restricted assignments (e.g. working the bar).
  - Address and birth date carry a short "Waarom vragen we dit?" note: suggestions close to home, and minimum ages for some tasks.
- **Account**: the email with its verification status (resend the link), changing the email, and changing the password.
  - Email verification: a link is sent at sign-up (valid 24 hours). It never blocks signing in; it only shows in the settings.
  - Changing the email sends a confirmation link to the **new** address; the email only changes when it is opened, and then counts as verified. The old address then gets a "your email was changed" notice. An address that already has an account is refused silently, so the answer doesn't reveal it.
  - Changing the password needs the current one and signs out other devices unless the user unticks that. A security notice is emailed (also after a password reset).
- **Who sees the profile**: the user sees all of their own. Anyone sharing an organization with them sees their phone; only owners and admins of a shared organization also see the address and birth date. Without a shared organization: nothing (404). Enforced in the backend (`GET /api/users/:userId/profile`).
- **Audit trail**: every change (profile fields, name, email change requested and confirmed, email verified, password changed or reset) is an account-level entry in the activity log, by field name only (see ActivityLog in section 13). Sign-ins and sign-outs are not logged. There is no screen for it yet.
- Not in this story: deleting the account (next story) and avatars.

### 7.2 Event Management

Features:

- Create event.
- Edit event.
- Archive event.
- Event name.
- Description.
- Date and time.
- Location.
- Event status.
- Assign event managers.

Statuses:

- Draft.
- Published.
- Completed.
- Archived.

Dashboard should display:

- Event overview.
- Upcoming tasks.
- Overdue tasks.
- Volunteer coverage.
- Budget summary.

### 7.3 Task Management

Each task belongs to one event and contains:

- Title.
- Description (plain text).
- Assignee: an organization member, a typed-in name for someone without an account, or nobody.
- Due date (a calendar day, no time).
- Status.
- Priority: low, medium (default) or high.
- Labels.
- Creator (kept as history).

Statuses:

- To do.
- In progress.
- Done.

Features:

- Create, edit, and delete (soft delete) tasks.
- Assign tasks.
- Mark tasks complete.
- A kanban board with one column per status (dragging the whole card changes its status), and a list view.
- Filter by status, assignee, priority and label; switch between "my tasks" and all tasks.
- Clicking a task opens it in a side pane where every field except the creator is edited in place ("inline", as in issue trackers): the value turns into its input without the layout moving, and each field saves on its own.
- "Mijn taken": one page with the user's tasks across all events that aren't archived.
- Removing an assignee, taking yourself off a task and deleting a task each ask for confirmation, with a warning that someone new has to be found.
- Show overdue tasks: due before today (Europe/Brussels) and not done, in the red status color.
- Warn (without blocking) when a due date falls after the event.
- Every write is in the activity log.
- Display tasks on the event dashboard (P1, not built yet).

Who does what:

- Organization owners and admins, and the event's managers, see every task of the event and create, edit and delete them. They also maintain the labels and handle assignment requests.
- Other members see the tasks assigned to them and the unassigned ones. They change the status of their own tasks, can take themselves off a task (it becomes unassigned), and can ask to be assigned an unassigned task. A manager approves or declines; approving one request declines the others, and assigning or deleting the task closes them too.
- Labels are per event (names unique per event, ignoring case) with a color from a fixed palette, so "Bar" in one event doesn't clutter another.
- When a member is removed from the organization, the admin first sees how many unfinished tasks they have per event. Their unfinished tasks become unassigned and their open requests are cancelled. Done tasks keep them as assignee, shown as "no longer active". The same note shows on tasks they created.
- Tasks of an archived event are read-only; a completed event's tasks can still change.

Not in scope yet: notifications, comments, subtasks, copying tasks into a new edition, manual ordering within a column.

Avoid building a complete project-management application.

### 7.4 Volunteer Teams and Shifts

Organizers can create teams.

Examples:

- Bar.
- Food stand.
- Setup.
- Cleanup.
- Ticket desk.
- Parking.

Each shift contains:

- Event.
- Team.
- Location or meeting point.
- Start time.
- End time.
- Required capacity.
- Assigned volunteers.

Features:

- Create shifts.
- Edit shifts.
- Delete shifts when safe.
- View staffing coverage.
- Identify unfilled positions.
- Prevent overbooking.

Decided November 2026 (teams, shifts and the planning board):

- **Teams belong to one event.** Created inline with suggestion chips (Bar, Kassa, Opbouw, …); only the name is required. A team can have a default meeting point that pre-fills its new shifts. Deleting a team deletes its shifts and their assignments (asks first when confirmed people would go) and clears it as anyone's preferred team. Copying teams from a previous edition comes later (or from the AI agent).
- **Shifts fall within the event.** An event may have an optional setup start (before it starts) and teardown end (after it ends); shifts may fall anywhere in that window, past midnight included. Changing the event so existing shifts fall outside is refused until they are moved. A shift can be duplicated.
- **Capacity is a target, not a hard limit.** Placing someone on a full shift, or on a shift they didn't mark as available, shows a warning and needs a confirmation. Only placing a volunteer on two overlapping shifts is refused. Editing a shift so assignments no longer fit is allowed; the board flags them (amber).
- **Coverage** shows per shift and per team ("3 van 5"): red while unfilled, green when full, amber above capacity.
- **Assignments are proposed, then confirmed.** Dragging creates a proposal; organizers confirm one by one or all at once. The AI agent will only ever create proposals.
- **Board:** the Planning tab of an event, a lane per team with its shifts, day tabs for multi-day events, and on the right the volunteers (search, filter by preferred team, those who still need shifts first). Dragging a volunteer highlights the shifts they marked and their preferred team.
- **Who:** everyone in the organization sees the board; org owners, admins and the event's managers change it.

### 7.5 Public Volunteer Registration

Volunteers must not need accounts.

Organizers publish a registration page.

Volunteer registration fields:

- Name.
- Email.
- Available time slots.
- Preferred team or task.
- Optional free-text preferences.
- Required privacy information/consent where applicable.

Two registration modes:

**Self-service registration**

Volunteers select an available shift.

The system reserves or confirms the position according to event settings.

**Managed allocation**

Volunteers provide availability and preferences.

The organizer or scheduling engine proposes assignments.

The organizer approves assignments before publishing.

Decided November 2026: **the pilot only has managed allocation.** Self-service booking comes later, if pilots ask for it.

- **Public page** `/e/[publicSlug]`: the slug is the event name plus a random suffix (`kerstmarkt-2026-x7k2`), created the first time registration is opened and never changed. It accepts sign-ups only while the event is published, registration is open and the deadline (optional) hasn't passed; otherwise it shows the event with a "closed" message.
- **What the volunteer fills in:** name, email, optional phone, the shifts they can do (ticked per team; a wish, not a booking), an optional preferred team, notes, and a required privacy consent. The event asks either a number of shifts per volunteer (the form requires at least that many ticks, or "available the whole event") or the whole event.
- **The page never shows other volunteers or fill levels.**
- **Volunteers are stored per organization** (unique email, ignoring case), applications per event. Signing up again with the same email updates the application. Anyone who knows an address can overwrite that sign-up; the acknowledgement email sent on every submit tells the real owner. Secure edit links (`/v/[token]`) come later.
- **Spam:** a hidden honeypot field and 5 sign-ups per 10 minutes per IP address and event (in memory, per backend instance). No CAPTCHA.
- **Added by hand:** organizers add people who didn't use the link; email is optional for them.
- **Publishing the schedule** emails each volunteer their confirmed shifts (team, day, time, meeting point), with the publishing organizer as reply-to. Proposed assignments are never sent. Optionally, volunteers without a shift get a thank-you. After the first publish the board shows how many volunteers have unpublished changes; publishing again only emails those (an update, or "you're no longer scheduled"). People without an email address are listed with their shifts for the organizer to contact. One email per volunteer, so a failure for one doesn't stop the rest; failures are tried again on the next publish.

Features:

- Public registration URL.
- Registration deadlines.
- Capacity validation.
- Duplicate registration handling.
- Registration acknowledgement email.
- Secure volunteer management link.

Important distinction:

A registration acknowledgement is not necessarily an assignment confirmation.

### 7.6 Volunteer Scheduling

Organizers can:

- View volunteer applications.
- Manually assign volunteers.
- Generate proposed assignments.
- Review allocation suggestions.
- Adjust assignments.
- Approve and publish schedules.

Scheduling considers:

- Availability.
- Shift capacity.
- Time conflicts.
- Preferred teams.
- Volunteer preferences.

Hard constraints:

- No overlapping assignments for one volunteer.
- No invalid event or team assignments.

Warnings an organizer may confirm (decided November 2026; earlier drafts made these hard):

- Assignments outside the volunteer's marked availability.
- Exceeding shift capacity.

Soft constraints:

- Preferred team.
- Preferred shift.
- Balanced allocation.
- Volunteer requests.

For MVP, use a deterministic scheduling algorithm.

A simple rule-based or greedy allocation algorithm is sufficient initially.

Advanced optimization can be introduced later.

### 7.7 Initial AI Feature

**AI-assisted volunteer preference extraction**

Volunteers can provide natural-language preferences.

Example:

"I can help after 18:00, preferably at the bar, but I need to leave before 22:00."

AI extracts structured information.

Example result:

```json
{
  "availableFrom": "18:00",
  "availableUntil": "22:00",
  "preferredTeams": ["bar"]
}
```

Implementation principles:

- Use schema-validated structured outputs.
- Validate extracted information.
- Never invent volunteer availability.
- Do not let AI override explicit form fields.
- Allow organizers to review uncertain information.
- Provide deterministic fallbacks.
- Do not allow AI to publish schedules automatically.

The LLM interprets language.

The scheduling engine performs allocation.

These responsibilities must remain separate.

### 7.8 Email Notifications

Initial email types:

- Organization invitation.
- Volunteer registration acknowledgement.
- Volunteer assignment confirmation.
- Assignment update.

Requirements:

- Transactional email provider.
- Reliable background delivery.
- Retry support.
- Delivery status tracking.
- Avoid duplicate emails.
- Secure personal links.
- Never confirm an assignment before it is published.

### 7.9 Basic Budget Management

Each event should support basic financial tracking.

Budget entry fields:

- Title.
- Category.
- Type: income or expense.
- Estimated amount.
- Actual amount.
- Optional supplier.
- Optional linked task.
- Notes.

Features:

- Add budget entry.
- Edit budget entry.
- Delete budget entry.
- Calculate total estimated expenses.
- Calculate total actual expenses.
- Calculate estimated and actual income.
- Calculate event balance.
- Display budget variance.

Do not build full accounting functionality.

Use exact decimal/integer monetary representations rather than floating-point calculations.

### 7.10 Basic Supplier Management

Organization-level supplier directory.

Supplier fields:

- Name.
- Category.
- Contact person.
- Email.
- Phone.
- Website.
- Notes.

Example categories:

- Beverages.
- Food.
- Lighting.
- Sound.
- Equipment rental.
- Decorations.
- Security.

Features:

- Create supplier.
- Edit supplier.
- Delete or archive supplier.
- Link supplier to event.
- Link supplier to budget entry.
- View which events used a supplier.

MVP does not require order management, contract management, or invoice processing.

---

## 8. P1 — First Major Release

### 8.1 Recurring Events

- Duplicate existing events.
- Reuse task structures.
- Reuse team structures.
- Reuse shift requirements.
- Reuse supplier references.
- Reset task and assignment statuses.
- Preserve historical financial data.

### 8.2 AI Event Planning

Generate suggested tasks based on:

- Event description.
- Event type.
- Event size.
- Previous events.
- Historical tasks.

AI suggestions must be reviewed before being saved.

### 8.3 AI Event Memory

Compare current events with previous editions.

Suggestions might include:

- Tasks frequently forgotten.
- Suppliers used previously.
- Staffing shortages.
- Budget differences.
- Tasks consistently completed late.

Historical suggestions must reference actual stored data.

### 8.4 Advanced Permissions

- Team Coordinator role.
- Team-specific access.
- Finance-specific permissions if needed.

Avoid implementing a fully customizable RBAC engine unless customer requirements justify it.

### 8.5 Volunteer Management Improvements

- Shift cancellation requests.
- Shift swap requests.
- Availability updates.
- Automated reminders.
- Calendar invitations.

### 8.6 Supplier and Expense Improvements

- Purchases.
- Supplier quotes.
- Payment status.
- Historical supplier costs.
- Task-to-supplier relationships.
- Task-to-budget relationships.

### 8.7 Event Evaluation

At the end of an event, organizers can record:

- What went well.
- What went wrong.
- Missing equipment.
- Volunteer problems.
- Supplier issues.
- Budget lessons.
- Suggestions for next year.

This information becomes part of event memory.

### 8.8 Exports

- Volunteer schedule export.
- Task list CSV export.
- Basic budget export.

---

## 9. P2 — Future Features

Potential additions:

- AI invoice and supplier quote extraction.
- AI-powered budget analysis.
- Advanced constraint-based volunteer scheduling.
- OR-Tools scheduling service.
- Equipment and inventory management.
- QR-based volunteer check-in.
- Volunteer skills and qualifications.
- Advanced scheduling fairness.
- Supplier email drafting.
- Advanced event reports.
- Accounting integrations.
- Multi-event financial analytics.
- AI conversational event assistant.
- Professional event-management workflows.
- Larger event support.

None of these are required to validate the MVP.

---

## 10. Core User Journeys

### Journey A — Create an Event

1. Admin creates organization.
2. Admin invites another organizer.
3. Event Manager creates event.
4. Manager enters event details.
5. Manager creates tasks.
6. Manager creates teams and shifts.
7. Manager publishes volunteer signup.
8. Manager monitors preparation dashboard.

Success criterion:

An organizer should be able to create a small event and publish volunteer registration in approximately 15 minutes without training.

### Journey B — Volunteer Registration

1. Volunteer opens event link.
2. Volunteer views available roles and shifts.
3. Volunteer enters name and email.
4. Volunteer selects availability.
5. Volunteer selects preferences.
6. Volunteer optionally writes additional comments.
7. Volunteer submits registration.
8. System confirms receipt by email.
9. Volunteer receives assignment confirmation when applicable.

No account required.

### Journey C — Volunteer Allocation

1. Organizer opens volunteer planner.
2. Organizer sees registrations.
3. Organizer selects automatic allocation.
4. Scheduling engine generates proposals.
5. System reports staffing gaps and conflicts.
6. Organizer reviews assignments.
7. Organizer manually adjusts assignments.
8. Organizer approves schedule.
9. System publishes assignments.
10. Volunteers receive confirmation emails.

### Journey D — Manage Event Finances

1. Organizer creates a budget item.
2. Organizer enters expected expense.
3. Organizer links supplier.
4. Organizer optionally links a preparation task.
5. Organizer records actual expense.
6. System calculates variance.
7. Event dashboard updates totals.

### Journey E — Repeat an Event (P1)

1. Organizer selects previous event.
2. Organizer chooses "Create new edition."
3. System duplicates relevant event structure.
4. Organizer reviews proposed tasks and shifts.
5. Organizer confirms suppliers and budget assumptions.
6. New event is created independently.
7. Historical data remains preserved.

---

## 11. Recommended Tech Stack

The project should use a modern TypeScript-first stack.

Priorities:

- Fast development.
- Strong type safety.
- Low operational complexity.
- Good developer experience.
- Reliable production deployment.
- Support for AI integrations.
- Easy maintenance by a solo developer.

### Frontend

**Next.js (App Router)**

- React.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- React Hook Form.
- Zod.
- TanStack Table for data-heavy interfaces.

Use server components where appropriate.

Use client components for interactive interfaces.

Decided November 2026:

- **Versions:** Next.js 16 (App Router, Turbopack, Cache Components and Partial Prefetching on), React 19, Tailwind v4 (CSS-first config), shadcn/ui (Radix base, "Maia" preset, restyled), Node 24. With Cache Components, anything that reads the request (session, params) sits behind `<Suspense>`; the rest of each page is a prerendered static shell.
- **Typed client:** `@hey-api/openapi-ts` (fetch client + Zod plugin) generates the SDK and the Zod schemas from `backend/openapi.json` into `frontend/src/api/generated/`. The output is gitignored and regenerated on `predev`, `prebuild` and in CI.
- **One way to reach Nest:** the generated SDK is configured once (`src/server/api.ts`, hey-api `runtimeConfigPath`): every call forwards the session cookie, `X-Internal-Secret` and `x-forwarded-for`, and a non-2xx answer throws a typed `ApiError`. That file imports `server-only`, so the SDK can't end up in the browser, and a lint rule allows SDK imports only under `src/server/`. No TanStack Query and no browser calls to Nest. The only exception is the Better Auth React client, which calls `/api/auth/*` through the Next.js route handler.
- **Contract checks:** breaking backend changes fail `tsc` in CI (the client is generated from the committed `openapi.json`). At runtime, every SDK call validates its request body and its response with the generated Zod schemas; a mismatch is logged as a contract violation. Better Auth reads (not in OpenAPI) are validated with small schemas in `src/server/auth.ts`. `better-auth`, `auth`, `zod` and `typescript` come from the pnpm catalog in `pnpm-workspace.yaml`, so both apps always use the same version.
- **Reads and writes (the convention):**
  - **Reads** live in `src/server/<feature>/queries.ts` (`server-only`), named `getX`/`listX`, each a one-liner around `query(sdkCall())`. `query()` turns API errors into pages: 401 → `/login`, no active organization → `/onboarding`, 403 → forbidden, 400/404 → not found. Server components call them behind `<Suspense>`.
  - **Writes** live in `src/server/<feature>/actions.ts` (`'use server'` once at the top), named with a verb (`createX`, `updateX`, `archiveX`), always built with `actionClient` from `src/server/action-client.ts` (next-safe-action): `.metadata({ name, apiFields? }).bindArgsSchemas([...])?.inputSchema(schema).action(...)`. Actions contain only the happy path; `toActionError` turns every failure into `{ message, fields? }`.
  - **Forms** use `useActionForm(action, schema, { defaultValues, onSuccess })` (`src/hooks/use-action-form.ts`); buttons use next-safe-action's `useAction`. Field and form errors are shown with `FormFieldError` / `FormError`.
  - **Schemas** shared by a form and its action live in `src/features/<feature>/schemas.ts` (`xFormSchema`). Their messages are translation keys (`msg('eventForm.validation.nameRequired')`), never text, so the same schema works on client and server; the UI translates when it shows them.
- **URLs:** no organization in the URL (`/events`, `/events/[eventId]/tasks`). The active organization lives in the Better Auth session and is changed with the organization switcher.
- **Route protection:** middleware only checks that the session cookie exists (redirect to `/login`). The `(app)` layout checks the real session server-side and sends users without an active organization to `/onboarding`. Nest still enforces all authorization.
- **i18n:** `next-intl`, `nl-BE` only, no locale prefix in URLs, every string in `messages/nl.json`. Dates and money use `Intl` (`nl-BE`, EUR). 24h time.
- **Timezone:** every event is in `Europe/Brussels` for the MVP. Forms convert Brussels time to UTC. No timezone setting.
- **Event form:** a start date and time and an end date and time. On a single-day event an end time before the start time means it runs past midnight (end on the next day); a later end date makes a multi-day event. Optional setup start and teardown end widen the window shifts may fall in.
- **Active organization on login:** every new Better Auth session starts in the user's oldest organization (a `session.create.before` hook in `backend/src/auth/auth.ts`), so returning organizers land on their events.
- **Auth flows in the first slice:** signup → `/onboarding` (organization name only; slug generated from the name with a numeric suffix if taken, never shown) → `/events`. `/invitations/[id]`: log in or sign up first, then Accept/Decline; accepting sets that organization as active. Password reset (`/forgot-password`, `/reset-password`) is included and needs Better Auth's `sendResetPassword` on the backend. Organizer email verification is deferred until just before the pilot.
- **Layout:** organizer app uses the shadcn `Sidebar` (organization level: Events, Suppliers, Members, Settings, org switcher, user menu). It collapses to a sheet on mobile. Inside an event, the sections (Overview, Tasks, Planning, Budget, Suppliers, Settings) are tabs under the event header. Public volunteer pages (`/e/[publicSlug]`, later `/v/[token]`) use their own minimal mobile-first layout.
- **Folder layout:**

  ```text
  frontend/
    src/
      app/(auth)/  app/(app)/  app/(public)/   thin routes
      server/                       everything server-only
        api.ts  api-errors.ts  query.ts  action-client.ts  auth.ts  env.ts
        <feature>/{queries.ts, actions.ts}   mirrors backend features
      features/<feature>/           UI: components + schemas.ts (shared with server/)
      components/ui/                shadcn components, restyled
      components/layout/            sidebar, event header, tabs
      hooks/                        use-action-form.ts
      api/generated/                generated SDK + Zod (gitignored)
      lib/                          format.ts, navigation.ts, auth-client.ts
      i18n/  messages/nl.json
    test/
      unit/                         Vitest, mirrors src/ paths
      e2e/                          Playwright
  ```

- **Dev workflow:** root `pnpm dev` runs Nest and Next in parallel. `frontend/.env.example` has `BACKEND_URL=http://127.0.0.1:4000` and `INTERNAL_API_SECRET`, validated with Zod at startup.
- **Quality gates:** oxlint (type-aware), Prettier, `tsc`, Vitest unit tests in `test/unit/` (money, dates, form mapping, action error mapping); tests never sit next to source files. One Playwright smoke test (signup → create organization → create event) runs locally, not in CI yet. CI frontend job: generate client → lint → typecheck → test → build → Docker build (`output: 'standalone'`).
- **First frontend slice:** scaffold + auth (signup, login, password reset, onboarding, invitations) + organizer shell + events list/create/edit, end-to-end against Nest.

### Backend

**NestJS 12 (ESM) on Node.js 24 LTS** — a separate API in `backend/`, built as a modular monolith.

Decided November 2026 (replaces the earlier Next.js + tRPC plan):

- **REST, with the Drizzle tables as the single source of truth.** Each feature derives its request/response Zod schemas from its tables with `drizzle-zod`. Nest validates them natively with `StandardSchemaValidationPipe` (`@Body({ schema })`), and `@nestjs/swagger` turns the same schemas into OpenAPI. The document is committed as `backend/openapi.json`, CI checks that it is up to date, and the frontend generates its typed client (and form schemas) from it. There is no shared code package between backend and frontend.
- **Next.js is the only way in (backend-for-frontend).** Browsers never call Nest. Next.js server components, server actions and route handlers call Nest with the typed client and forward the user's cookie. `/api/auth/*` is forwarded by a Next.js route handler (`frontend/src/app/api/auth/[...all]/route.ts`; a plain rewrite can't add the internal secret), so the session cookie stays first-party on the Next.js origin.
- **Nest is private.** It listens on a private network only, with CORS disabled. Every request must carry the shared `X-Internal-Secret` header (except `/api/health`). This is defense in depth: Nest still authenticates and authorizes every request itself.
- **pnpm workspaces**: `backend`, `frontend`.
- **CI** (GitHub Actions): format, lint (oxlint, type-aware), type checks, unit and integration tests (Testcontainers), migration and OpenAPI sync checks, and the Docker build.

Do not introduce microservices prematurely.

### Database

**PostgreSQL**

Hosted on **Neon** (pooled connection string for the app, direct one for migrations). Development uses a `dev` branch branched from production. Integration tests run against a throwaway Postgres 17 container (Testcontainers) that is started and removed with each test run.

ORM: **Drizzle ORM** (decided), via the first-party `@nestjs/drizzle` module.

Reasons:

- Strong TypeScript integration.
- SQL-oriented approach.
- Explicit schemas and migrations.
- Good control over database queries (e.g. concurrent signup capacity).

Migrations are generated with `drizzle-kit generate` and committed as SQL. Never use `drizzle-kit push` against Neon.

### Authentication

**Better Auth**

For:

- Organizer authentication.
- Sessions.
- Organization invitations.
- Role management integration.

Authorization and tenant isolation must be enforced on the server.

Decided approach:

- **Better Auth organization plugin** handles organizations, membership, the organization roles (`owner`/`admin` = Organization Admin, `member` = organizer) and expiring/revocable invitations.
- **Event-level access** is a small hand-written authorization module in `backend/src/authz`: pure policy functions plus Nest guards (`@OrgScoped()`, `@RequireEventAccess()`). Event Managers are rows in `event_member`. No CASL or external permission service until the P1 Team Coordinator role demands it.
- **Tenant isolation is application-level**: every repository method takes the `organizationId` it works in, and events of other organizations answer 404. No Postgres row-level security in the MVP; revisit after the pilot.

Volunteer access should use separately designed email-based access links rather than full application accounts.

### Email

**Resend**

For:

- Organization invitations.
- Registration acknowledgements.
- Assignment confirmations.
- Assignment updates.
- Future reminders.

Implemented in `backend/src/email` (see "Email" in the backend README):

- Templates are React Email components in Dutch (`nl-BE`, informal "je"), sharing one layout: preheader, wordmark, content card with one call to action and a fallback link, and a footer saying why the recipient got the email. The plain-text version is generated from the HTML.
- One entry point, `EmailService.send({ template, to, props, idempotencyKey })`. Adding an email means adding a template file and one registry line; delivery, retries and logging are shared.
- Every send is recorded in `email_delivery` before the provider is called. The same idempotency key never sends twice; the key is also passed to Resend.
- Temporary provider errors (network, 5xx, rate limits) are tried up to 3 times with a short backoff (0.5 s, 1.5 s), inside the request.
- `EMAIL_PROVIDER=console` (the development default) prints emails; `resend` sends them and is required in production.
- `pnpm email:dev` previews the templates; `pnpm email:test --to <address>` sends each one through the real pipeline.

Planned: emails will be sent in the name of the VolunteerOS AI agent once it has a name and persona (sender name and copy are configurable per template).

### Background Jobs

Use a durable background-job system.

Potential solutions:

- Trigger.dev.
- Inngest.
- A PostgreSQL-backed job queue.

Final provider selection can be made during implementation.

Required capabilities:

- Retries.
- Idempotency.
- Scheduled execution.
- Error tracking.
- Reliable email delivery.

**Decision (November 2026): no job system yet.** The only emails are organization invitations and password resets, both sent while the user waits, and nothing runs on a schedule. They are sent inside the request, with quick retries and an idempotency key, and every send is logged in `email_delivery`. If sending fails after the retries, the request fails, so the organizer knows to try again (a failed invitation is canceled, never left pending).

Revisit when the first scheduled or bulk email arrives (reminders, assignment confirmations to many volunteers): pick between a Postgres-backed queue (pg-boss or Graphile Worker; no new infrastructure) and a hosted service (Trigger.dev or Inngest). The worker will call the same `EmailService.send`, so templates and the delivery log stay as they are.

### AI

Use a provider abstraction around schema-validated LLM calls.

Start with one model/provider rather than building complex multi-model infrastructure.

AI features should use:

- Structured outputs.
- Zod validation.
- Explicit tool contracts.
- Logging.
- Evaluation datasets.
- Human review.
- Safe deterministic fallbacks.

### Scheduling Engine

MVP:

TypeScript scheduling service using deterministic rules.

Future:

Google OR-Tools if more advanced optimization becomes necessary.

The scheduling engine should remain logically separate from LLM interpretation.

### Hosting

Constraint: Next.js and Nest must run **on the same platform with private networking** (e.g. Railway or Fly.io; provider chosen near the pilot), because Nest is not exposed to the internet. Vercel-hosted Next.js cannot reach a private Nest service. Both apps ship as Docker images.

Recommended initial approach:

- Next.js and Nest on one platform with private networking.
- Managed PostgreSQL: Neon.
- Cloud object storage later if necessary.
- Managed email provider.
- Managed background jobs.

Keep deployment simple.

### Monitoring

Use:

- Sentry for error tracking.
- Structured application logging.
- AI request tracing.
- Basic usage analytics.
- Email delivery logs.

Never log sensitive volunteer data unnecessarily.

### Testing

Use:

- Vitest for unit and integration tests.
- Playwright for end-to-end testing.
- Database integration tests.
- Dedicated scheduling algorithm tests.
- AI structured-output evaluations.

Priority test areas:

- Organization isolation.
- Authorization.
- Volunteer registration.
- Concurrent signup capacity.
- Scheduling constraints.
- Email idempotency.
- Monetary calculations.

---

## 12. High-Level Architecture

Start with a modular monolith.

Repository layout:

```text
backend/                 NestJS API (private, reached only via the Next.js server)
└── src/
    ├── config/          env validation (Zod)
    ├── db/              Drizzle schema + committed SQL migrations
    ├── auth/            Better Auth instance, global AuthGuard, @Public/@CurrentUser
    ├── authz/           org context, event policies, guards
    ├── email/           EmailService (console in dev, Resend in production)
    ├── common/          health check, internal-secret middleware
    └── features/
        ├── events/      controller → service → repository
        ├── tasks/       (next)
        ├── volunteers/  …
        ├── scheduling/
        ├── budgets/
        ├── suppliers/
        └── ai/
frontend/                Next.js (App Router): UI + server-side calls to the backend,
                         through a client generated from backend/openapi.json
```

Each feature should contain its own:

- Business logic.
- Validation schemas.
- Data access.
- API procedures.
- Components where appropriate.
- Tests.

Avoid tightly coupling AI logic directly to UI components.

---

## 13. Initial Database Entities

### Organization

- id
- name
- slug
- createdAt
- updatedAt

### User

- id
- name
- email
- emailVerified
- createdAt

Authentication-related tables are managed by the authentication solution.

### UserProfile

Implemented as `user_profile`: personal details, one row per user (`userId` is the key), created on the first save and deleted with the user. Kept out of Better Auth's user table, so they never travel in the session.

- userId
- phone (E.164)
- street, houseNumber, box, postalCode, city, country (ISO 3166-1 alpha-2): all set or all empty, only box optional
- birthDate
- createdAt
- updatedAt

### OrganizationMember

- id
- organizationId
- userId
- role

### Event

- id
- organizationId
- name
- eventType (market, festival, party, quiz, meal, sports, camp, trip, other)
- description
- location
- startsAt
- endsAt (may be days later: a festival weekend is one event)
- status
- previousEditionId (the earlier event this one continues; editions form one chain, in date order)
- expectedAttendance
- actualAttendance
- retrospective (lessons learned, for the next edition)
- createdAt
- updatedAt

### EventMember

- id
- eventId
- userId
- role

### Task

- id
- eventId
- title
- description
- status (todo, in_progress, done)
- priority (low, medium, high)
- dueDate (a calendar day)
- assigneeUserId (an organization member) or assigneeName (someone without an account), never both
- createdByUserId
- createdAt
- updatedAt

### TaskLabel

- id
- eventId
- name (unique per event, ignoring case)
- color (gray, red, orange, yellow, green, teal, blue, purple)

### TaskLabelLink

- taskId
- labelId

### TaskAssignmentRequest

- id
- taskId
- userId (the member asking)
- status (pending, approved, declined, cancelled)
- createdAt

### Team

- id
- eventId
- name
- description
- defaultMeetingPoint

### Shift

- id
- eventId
- teamId
- meetingPoint
- startsAt
- endsAt
- capacity

### Volunteer

- id
- organizationId
- name
- email (optional for people added by hand; unique per organization when set)
- phone
- createdAt

Volunteers do not need authenticated user accounts.

### VolunteerApplication

- id
- eventId
- volunteerId
- source (public link or added by hand)
- availableShiftIds (the shifts the volunteer can do)
- wholeEvent (available for the whole event)
- preferredTeamId
- notes
- consentedAt
- notifiedSchedule (the confirmed shifts last emailed, to know who changed)
- createdAt

### Assignment

- id
- applicationId
- shiftId
- status
- assignedByUserId
- createdAt

Statuses:

- Proposed.
- Confirmed.

Unassigning soft-deletes the assignment.

### Supplier

- id
- organizationId
- name
- category
- contactName
- email
- phone
- website
- notes

### EventSupplier

- id
- eventId
- supplierId
- notes

### BudgetEntry

- id
- eventId
- supplierId (nullable)
- taskId (nullable)
- title
- category
- type
- estimatedAmount
- actualAmount
- notes

### EmailDelivery

Implemented as `email_delivery`: an append-only log, without soft delete.

- id
- organizationId (nullable: a password reset belongs to no organization)
- eventId (nullable)
- recipient
- template (text, so adding an email needs no migration)
- subject
- status (pending / sent / failed)
- idempotencyKey (unique)
- providerMessageId
- attempts
- lastError
- createdAt
- updatedAt
- sentAt

### ActivityLog

Implemented as `activity_log`; see "Activity log" in the backend README.

- id
- organizationId (nullable: changes to a user's own account belong to no organization; entityType is then `user`)
- eventId (nullable: organization-level changes)
- actorType (user / volunteer / system / ai)
- actorId
- onBehalfOfUserId (the user an AI agent acted for)
- action
- entityType
- entityId
- changes (field names; values only for non-personal fields)
- createdAt

Every deletion is a soft delete (`deleted_at`). The only planned exception is GDPR erasure of personal data.

This is an initial conceptual model.

Relationships, indexes, constraints, privacy requirements, and normalized structures should be refined before implementation.

---

## 14. AI Architecture and Principles

### Rule 1: AI does not own business logic

AI can interpret, summarize, and suggest.

Deterministic services validate and execute operations.

### Rule 2: Structured output

All AI outputs affecting application data must follow defined schemas.

Never directly trust model-generated JSON.

### Rule 3: Human approval

AI must not independently:

- Publish volunteer schedules.
- Change confirmed assignments.
- Send consequential emails.
- Approve financial expenses.
- Modify organization permissions.

### Rule 4: Grounding

AI suggestions based on historical events must reference actual stored records.

Do not invent previous costs, suppliers, or decisions.

### Rule 5: Evaluation

Maintain a small evaluation dataset for AI features.

Measure:

- Extraction accuracy.
- Invalid outputs.
- Missing information.
- Scheduling conflicts.
- Organizer override frequency.
- Accuracy of historical suggestions.

### Rule 6: Privacy

Minimize personal data shared with AI providers.

Avoid processing unnecessary sensitive information.

Design data retention and deletion from the beginning.

---

## 15. Privacy and Security

VolunteerOS will process personal information.

Essential requirements:

- GDPR-aware processing.
- Clear privacy notices.
- Appropriate legal basis for processing.
- Secure authentication.
- Role-based authorization.
- Organization-level data isolation.
- Expiring volunteer access links.
- Rate limiting on public forms.
- Protection against spam and automated abuse.
- Personal data deletion workflows.
- Data retention policies.
- Secure storage and transmission.
- Minimal data collection.
- Audit logging for consequential actions.

Pay particular attention to youth associations where volunteers may be minors. Nobody under 13 can enter a birth date (Belgian age of digital consent); once age-restricted assignments exist, an unknown birth date counts as a minor.

Public registration forms must never expose other volunteers' information.

---

## 16. Competitor Landscape

### Twizzit

Website: https://www.twizzit.com/

Strengths:

- Association management.
- Members.
- Volunteer planning.
- Automatic matching.
- Communication.
- Financial functionality.

Potential VolunteerOS differentiation:

A simpler event-first interface without the overhead of a broad association management system.

### eventplanner.net

Website: https://www.eventplanner.net/

Strengths:

- Event task management.
- Supplier management.
- Budgets.
- Reusable event templates.
- Professional event planning.

Potential differentiation:

Volunteer-first workflows, lightweight onboarding, and AI-assisted recurring event planning for community organizations.

### Stamhoofd

Website: https://www.stamhoofd.be/

Strengths:

- Youth association management.
- Membership administration.
- Registrations.
- Organization permissions.

Potential differentiation:

Focused event operations rather than general association administration.

### Strobbo

Website: https://strobbo.com/

Strengths:

- Scheduling.
- Availability tracking.
- Volunteer and workforce planning.

Potential differentiation:

Integrating event preparation, budgets, suppliers, and volunteer coordination without professional workforce complexity.

### SignUpGenius

Website: https://www.signupgenius.com/

Strengths:

- Simple signup.
- Account-free registration.
- Shift management.
- Reminders.

Potential differentiation:

An integrated organizer workspace beyond signup forms.

### Rosterfy

Website: https://www.rosterfy.com/

Strengths:

- Large-scale volunteer management.
- Automation.
- Advanced scheduling.
- AI initiatives.

Potential differentiation:

Simplicity and affordability for small community organizations.

### Competitive Strategy

Do not try to compete with every feature offered by mature products.

Focus on:

1. Simplicity.
2. Fast onboarding.
3. Integrated event operations.
4. Account-free volunteer participation.
5. Useful AI assistance.
6. Reusable event knowledge.
7. Affordable organization-based pricing.

These differentiators are hypotheses and must be validated.

---

## 17. UX and Design Principles

### Simple by Default

The platform must be approachable for nontechnical organizers.

Avoid unnecessary configuration.

### Event-Centered Navigation

Users should quickly access:

- Overview.
- Tasks.
- Volunteers.
- Budget.
- Suppliers.
- Settings.

### Desktop and Mobile

Organizers may primarily plan on desktop.

Volunteers will often register on mobile.

The application must be responsive.

### No Forced Accounts for Volunteers

This is a non-negotiable product principle.

### Clear Statuses

Use understandable labels and visible progress.

Examples:

- 12 of 15 volunteer positions filled.
- 8 of 12 tasks completed.
- €420 spent from €600 estimated expenses.

### Visual Style ("Lagune", decided November 2026)

Friendly and community-like, deliberately not the default shadcn / Linear / Notion look. Simple, uncluttered screens.

- **Light mode only** for the MVP. Every color is a CSS variable, so dark mode can be added later.
- **Colors are defined in one place:** a single block of brand variables in `frontend/src/app/globals.css`. shadcn's semantic variables (`--primary`, `--ring`, `--sidebar`, …) only reference these brand variables, never raw hex values.

  | Token | Value | Use |
  | --- | --- | --- |
  | `--brand-primary` | `#147A90` | Button fills, active tab (white text passes AA) |
  | `--brand-primary-bright` | `#1A9DB8` (pacific cyan) | Links, focus rings, highlights |
  | `--brand-secondary` | `#43B3AE` (verdigris) | Secondary actions, progress bars, selected states |
  | `--brand-tint` | `#E3F0ED` | Light surfaces: sidebar, soft buttons, selected rows |
  | `--brand-tint-strong` | `#7FB3AA` (muted teal) | Borders of checkboxes, avatars, subtle accents |
  | `--brand-accent` | `#F28C6B` (coral), text `#4A1E10` | Sparingly: main public call to action, "new" badges |
  | `--background` | `#FAF7F2` (warm cream) | Page background; cards are white on top |
  | `--foreground` | `#1F3B3F`, muted `#5B7376` | Teal-tinted text |

- **Status colors are separate from the brand colors:** green `#2E9E5B` = done or filled, amber `#B7791F` = due soon or partly filled, red `#C2453D` = overdue or unfilled (each with a light background tint).
- **Type:** Nunito everywhere (via `next/font`), headings at weight 800.
- **Shape:** `1rem` radius on cards and dialogs, pill-shaped buttons, tabs and badges, soft shadows instead of hard borders, 44px buttons and inputs, generous padding. One primary action per screen. Tables only where they really pay off.
- **Creating vs. viewing (decided November 2026):** creating something new (a shift, a task, a volunteer added by hand) always opens a centered modal (`components/ui/dialog.tsx`). The side sheet (`Sheet`) is only for looking at and editing something that already exists. Never use the side sheet as a create form.
- **Icons:** Lucide, placed in soft colored circles for empty states, dashboard cards and section headers. No custom illustrations in the MVP.
- **Public volunteer pages:** same tokens, lighter feel. A colored header with soft circles and the form on a rounded sheet, large touch targets, a coral submit button.
- Reference prototype: https://claude.ai/artifact/VNcfaPKRXKhxBER4zfvJ6a (variant A).

### AI Must Be Explainable

When AI suggests an action, users should understand why.

Examples:

- "This volunteer indicated availability after 18:00."
- "This supplier was used for last year's edition."
- "The suggested expense is based on last year's actual cost."

---

## 18. MVP Success Criteria

Initial pilot goals:

- At least 3 organizations test VolunteerOS.
- At least 2 pilot organizations are outside the founder's organization.
- At least 50 real volunteer registrations.
- Small event setup possible in approximately 15 minutes.
- At least 2 of 3 pilot organizers express genuine intent to reuse it.

Operational measurements:

- Time required to create an event.
- Time required to prepare volunteer schedules.
- Signup completion rate.
- Number of unfilled shifts.
- Number of manually corrected assignments.
- Number of organizer support questions.
- Email delivery success.
- Repeat use.

These numbers are validation targets, not guaranteed outcomes.

The most important question:

**Does VolunteerOS save organizers meaningful time compared with their existing workflow?**

---

## 19. Development Roadmap

### Phase 0 — Validation

Before substantial development:

- Interview at least 5 event organizers.
- Review their existing workflows.
- Study their spreadsheets and planning documents.
- Identify their biggest recurring problems.
- Confirm the highest-value MVP workflows.

### Phase 1 — Foundation

Build:

- Next.js project.
- Database schema.
- Authentication.
- Organizations.
- Organization invitations.
- Events.
- Task management.
- Event dashboard.

### Phase 2 — Volunteer Management

Build:

- Teams.
- Shifts.
- Public registration.
- Volunteer applications.
- Manual scheduling.
- Registration acknowledgements.
- Assignment publishing.
- Email confirmations.
- Secure volunteer access.

This phase should deliver the first end-to-end usable product.

### Phase 3 — Integrated Operations

Build:

- Basic budgets.
- Income and expenses.
- Supplier directory.
- Supplier/event associations.
- Financial dashboard.
- AI preference extraction.
- Automatic scheduling suggestions.

### Phase 4 — Pilot

- Test with real event organizers.
- Gather feedback.
- Fix usability problems.
- Improve reliability.
- Measure actual usage.
- Avoid adding unrelated features.

### Phase 5 — V1

Based on customer feedback:

- Recurring event templates.
- AI event planning.
- Event memory.
- Team coordinators.
- Shift change requests.
- Improved budgets and supplier workflows.

---

## 20. Monetization Hypothesis

A possible future pricing model:

### Community — Free

- One active event.
- Basic tasks.
- Volunteer registration.
- Basic scheduling.

### Organization — Paid

Indicative price: €9–19/month.

Potential features:

- Multiple events.
- Historical events.
- Advanced budget features.
- Suppliers.
- AI assistance.
- Templates.

### Larger Organizations

Custom pricing or event-based pricing.

These prices are hypotheses.

Do not implement subscriptions or payment infrastructure during MVP development.

Validate willingness to pay first.

Avoid per-volunteer pricing.

---

## 21. Explicit Non-Goals

Do NOT build the following during the MVP:

- Full organization ERP.
- Member subscription management.
- General accounting software.
- Payroll.
- Professional staffing contracts.
- Ticketing.
- Internal messaging/chat.
- Complex inventory management.
- Native mobile applications.
- Fully customizable permissions.
- Complete form builder.
- Advanced AI agents.
- Autonomous financial actions.
- Multi-provider AI orchestration.
- Custom infrastructure unnecessarily.
- Microservices.
- Complex billing systems.
- Professional event-company features.

Avoid premature abstraction and overengineering.

---

## 22. Development Principles

1. Build for real users, not just a portfolio.
2. Prioritize practical workflows over impressive features.
3. Keep the MVP small enough for a solo developer.
4. Prefer established libraries over custom infrastructure.
5. Use TypeScript consistently.
6. Maintain strict validation at system boundaries.
7. Keep business logic separate from AI logic.
8. Keep organization data isolated.
9. Design mobile-first volunteer experiences.
10. Write meaningful tests for critical workflows.
11. Ship functional vertical slices.
12. Collect feedback from real event organizers.
13. Don't build P1/P2 features before validating P0.
14. Avoid premature scaling optimizations.
15. Keep the product useful when AI services are unavailable.

---

## 23. Open Decisions

The following decisions are NOT final:

- Exact hosting provider.
- Exact background job provider (deferred until the first scheduled or bulk email; see "Background Jobs").
- A platform admin role (VolunteerOS staff, above organization owners) with admin features such as an in-app log of every sent email. Until then, the React Email preview server and the `email_delivery` table serve that purpose.
- Final authentication integration details.
- Final AI model/provider.
- Whether budget functionality needs simplification.
- Exact scheduling algorithm.
- Exact organization pricing.
- Event template design.
- Volunteer data retention periods.

Resolve these decisions when required by implementation or user feedback.

---

## 24. Product North Star

VolunteerOS should make it possible for a small group of volunteers to organize a successful community event without maintaining multiple spreadsheets, forms, and disconnected planning tools.

The long-term vision is a platform that becomes more useful with each event an organization organizes.

**Every event should make the next event easier.**

---

## 25. Instructions for AI Coding Assistants

When working on this project:

1. Read this document before proposing major architectural or product changes.
2. Respect the P0/P1/P2 priorities.
3. Do not implement unrequested features.
4. Prefer straightforward, production-appropriate solutions.
5. Use the agreed technology stack unless a change is justified.
6. Separate application logic, data access, and AI services.
7. Enforce authorization on the server.
8. Never assume that client-side validation is sufficient.
9. Protect volunteer personal information.
10. Ensure that background jobs are retryable and idempotent.
11. Write tests for important business rules.
12. Keep user interfaces simple and intuitive.
13. Ask for a product decision when requirements materially conflict.
14. Update this document when a major product decision changes.
15. Avoid treating future features as MVP requirements.

### Current Development Objective

Build the smallest usable version of VolunteerOS that allows a community organization to:

1. Create an event.
2. Organize preparation tasks.
3. Define volunteer shifts.
4. Collect volunteer applications without accounts.
5. Propose and approve assignments.
6. Notify volunteers by email.
7. Track basic event costs and suppliers.

The MVP is successful when a real organization can use this workflow to coordinate an actual event.
