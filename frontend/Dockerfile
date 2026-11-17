# Build from the repository root: docker build -f frontend/Dockerfile .
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --filter @volunteeros/frontend...
# The API client is generated from the committed OpenAPI document during the build.
COPY backend/openapi.json backend/
COPY frontend frontend
RUN pnpm --filter @volunteeros/frontend build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /repo/frontend/.next/standalone ./
COPY --from=build /repo/frontend/.next/static ./frontend/.next/static
USER node
EXPOSE 3000
# Needs BACKEND_URL (Nest's private address) and INTERNAL_API_SECRET at runtime.
CMD ["node", "frontend/server.js"]
