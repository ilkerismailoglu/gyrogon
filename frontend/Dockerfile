# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.25.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/game-core/package.json packages/game-core/tsconfig.json ./packages/game-core/
COPY frontend/package.json frontend/tsconfig.json ./frontend/
COPY backend/package.json ./backend/

RUN pnpm install --frozen-lockfile

COPY packages/game-core/src ./packages/game-core/src
COPY frontend ./frontend

RUN pnpm --filter @gyrogon/game-core build && pnpm --filter @gyrogon/frontend build

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
