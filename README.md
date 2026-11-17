# VolunteerOS

AI-assisted event management for community organizations. Product context and decisions: [docs/info.md](docs/info.md).

## Layout

| Path        | What                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `backend/`  | NestJS 12 API. Private: only the Next.js server talks to it. See [backend/README.md](backend/README.md). |
| `frontend/` | Next.js 16 app: the only thing browsers talk to. See [frontend/README.md](frontend/README.md).           |

## Prerequisites

- Node.js 24 (`.nvmrc`), pnpm 9 (`corepack enable`)
- A Neon project with a `dev` branch (branched from production)
- Docker Desktop, for the integration tests (they start a throwaway Postgres container)

## Getting started

```bash
pnpm install
cp backend/.env.example backend/.env     # fill in the Neon URLs and the two secrets
cp frontend/.env.example frontend/.env   # same INTERNAL_API_SECRET as the backend
pnpm db:migrate
pnpm dev                                 # Nest on :4000, Next.js on http://localhost:3000
```

Details: [backend/README.md](backend/README.md) (structure, migrations, tests, CI) and [frontend/README.md](frontend/README.md) (BFF, typed client, theme, i18n).
