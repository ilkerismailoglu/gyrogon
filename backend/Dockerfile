# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.25.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/game-core/package.json packages/game-core/tsconfig.json ./packages/game-core/
COPY backend/package.json backend/tsconfig.json ./backend/
COPY frontend/package.json ./frontend/

RUN pnpm install --frozen-lockfile

COPY packages/game-core/src ./packages/game-core/src
COPY backend/src ./backend/src
COPY backend/drizzle ./backend/drizzle
COPY backend/drizzle.config.ts ./backend/

RUN pnpm --filter @gyrogon/game-core build && pnpm --filter @gyrogon/backend build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.25.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/game-core/package.json ./packages/game-core/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/game-core/dist ./packages/game-core/dist
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/drizzle ./backend/drizzle

WORKDIR /app/backend
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/server.js"]
