# syntax=docker/dockerfile:1

# Alpine for size. The 22 LTS line rather than one patch release, so that a rebuild picks
# up security fixes.
FROM node:22-alpine AS base
WORKDIR /app

# Every dependency, for the build and for the migrate job. Only the manifests are copied,
# so nothing but a change to the lockfile rebuilds this layer.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# What the API needs at run time. --omit=dev alone would keep the Prisma CLI and TypeScript:
# they are optional peers of @prisma/client, and npm installs those unless optional packages
# are omitted too. That is 436 MB of node_modules against 159 MB.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional

# Compiles the API. Takes the schema but not the migrations, so adding a migration
# recompiles nothing.
FROM deps AS build
COPY tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma/schema.prisma prisma/
COPY src src
RUN npm run build

# One-shot job that applies migrations and demo data. Used by docker-compose.yml.
FROM build AS migrate
ENV NPM_CONFIG_UPDATE_NOTIFIER=false PRISMA_HIDE_UPDATE_MESSAGE=true
COPY prisma prisma
USER node
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

FROM base AS runtime
ENV NODE_ENV=production PORT=3000
COPY --from=prod-deps /app/node_modules node_modules
# The one optional package the API does need: the native argon2 binary for this platform.
COPY --from=deps /app/node_modules/@node-rs node_modules/@node-rs
COPY --from=build /app/dist dist
COPY package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/v1/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Exec form, so node is PID 1 and receives SIGTERM for a graceful shutdown.
CMD ["node", "dist/main.js"]
