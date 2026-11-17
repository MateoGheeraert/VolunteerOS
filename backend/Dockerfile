# Build from the repository root: docker build -f backend/Dockerfile .
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile --filter @volunteeros/backend...
COPY backend backend
RUN pnpm --filter @volunteeros/backend build \
 && pnpm --filter @volunteeros/backend deploy --prod /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/backend/dist ./dist
COPY --from=build /repo/backend/src/db/migrations ./migrations
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
