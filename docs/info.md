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

Requirements:

- Multi-tenant data isolation.
- Secure authentication.
- Expiring and revocable invitations.
- Server-side authorization.

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

Each task contains:

- Title.
- Description.
- Assigned organizer.
- Due date.
- Status.

Statuses:

- To do.
- In progress.
- Done.

Features:

- Create, edit, and delete tasks.
- Assign tasks.
- Mark tasks complete.
- Filter by status or owner.
- Show overdue tasks.
- Display tasks on the event dashboard.

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

- No overlapping confirmed assignments.
- No assignments outside confirmed availability.
- No exceeding shift capacity.
- No invalid event or team assignments.

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

### Backend

**Next.js + TypeScript**

Use a modular monolith initially.

Preferred API approach:

**tRPC**

Reasons:

- Type-safe frontend/backend integration.
- Familiar developer experience.
- Shared TypeScript models.
- Good fit for complex forms and dashboards.

Do not introduce microservices prematurely.

### Database

**PostgreSQL**

Preferred ORM:

**Drizzle ORM**

Reasons:

- Strong TypeScript integration.
- SQL-oriented approach.
- Explicit schemas and migrations.
- Good control over database queries.

Prisma is a valid alternative, but choose one ORM and use it consistently.

### Authentication

**Better Auth**

For:

- Organizer authentication.
- Sessions.
- Organization invitations.
- Role management integration.

Authorization and tenant isolation must be enforced on the server.

Volunteer access should use separately designed email-based access links rather than full application accounts.

### Email

**Resend**

For:

- Organization invitations.
- Registration acknowledgements.
- Assignment confirmations.
- Assignment updates.
- Future reminders.

Use React Email for templates if helpful.

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

Recommended initial approach:

- Vercel for Next.js deployment.
- Managed PostgreSQL (e.g. Neon or Supabase).
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

Suggested modules:

```text
src/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   └── (public)/
├── components/
│   ├── ui/
│   └── shared/
├── features/
│   ├── organizations/
│   ├── events/
│   ├── tasks/
│   ├── volunteers/
│   ├── scheduling/
│   ├── budgets/
│   ├── suppliers/
│   └── ai/
├── server/
│   ├── api/
│   ├── auth/
│   ├── db/
│   ├── jobs/
│   └── email/
└── lib/
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
- createdAt

Authentication-related tables are managed by the authentication solution.

### OrganizationMember

- id
- organizationId
- userId
- role

### Event

- id
- organizationId
- name
- description
- location
- startsAt
- endsAt
- status
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
- assigneeId
- dueAt
- status
- createdAt

### Team

- id
- eventId
- name
- description

### Shift

- id
- eventId
- teamId
- location
- startsAt
- endsAt
- capacity

### Volunteer

- id
- organizationId
- name
- email
- createdAt

Volunteers do not need authenticated user accounts.

### VolunteerApplication

- id
- eventId
- volunteerId
- availability
- preferences
- notes
- status
- createdAt

Availability and preferences may initially be modeled using structured JSON or related tables.

### Assignment

- id
- applicationId
- shiftId
- status
- assignedBy
- createdAt

Statuses:

- Proposed.
- Confirmed.
- Cancelled.

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

- id
- eventId
- recipient
- template
- status
- providerMessageId
- createdAt
- sentAt

### AuditLog

- id
- organizationId
- actorId
- action
- entityType
- entityId
- metadata
- createdAt

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

Pay particular attention to youth associations where volunteers may be minors.

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
- Exact background job provider.
- Final authentication integration details.
- Final AI model/provider.
- Whether budget functionality needs simplification.
- Whether both volunteer registration modes are necessary for the first pilot.
- Exact scheduling algorithm.
- Exact organization pricing.
- Dutch-only MVP or bilingual launch.
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
