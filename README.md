# VolunteerOS

AI-assisted event management for community organizations. Product context and decisions: [docs/info.md](docs/info.md).

## Layout

| Path        | What                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `backend/`  | NestJS 12 API. Private: only the Next.js server talks to it. See [backend/README.md](backend/README.md). |
| `frontend/` | Next.js app (not set up yet).                                                                            |

## Prerequisites

- Node.js 24 (`.nvmrc`), pnpm 9 (`corepack enable`)
- A Neon project with a `dev` branch (branched from production)
- Docker Desktop, for the integration tests (they start a throwaway Postgres container)

## Getting started

```bash
pnpm install
cp backend/.env.example backend/.env   # fill in the Neon URLs and the two secrets
pnpm db:migrate
pnpm dev
```

Details on the backend structure, migrations, tests and CI: [backend/README.md](backend/README.md).
