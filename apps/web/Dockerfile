## Build context: repo root (set in docker-compose.yml)

# ─── Base ───────────────────────────────────────────────
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ─── Install dependencies ───────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json       ./apps/web/package.json
COPY packages/types/package.json ./packages/types/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ─── Build ──────────────────────────────────────────────
FROM deps AS builder
COPY . .

RUN pnpm --filter @blurr-tools/types build \
    && pnpm --filter @blurr-tools/web build

# ─── Production image (nginx) ───────────────────────────
FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
