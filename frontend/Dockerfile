# OpenMAIC frontend (Next.js, pnpm workspace). Adapted from the upstream
# Dockerfile + China mirrors (apk Tsinghua, npm npmmirror) for fast server builds.
# ---- Stage 1: base ----
FROM node:22-alpine AS base
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apk/repositories
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# ---- Stage 2: deps ----
FROM base AS deps
RUN apk add --no-cache python3 build-base g++ cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY scripts/ ./scripts/
RUN pnpm config set registry https://registry.npmmirror.com \
    && pnpm install --frozen-lockfile

# ---- Stage 3: builder ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm build

# ---- Stage 4: runner ----
FROM node:22-alpine AS runner
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apk/repositories
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
RUN apk add --no-cache libc6-compat cairo pango jpeg giflib librsvg
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Database migrations and the bootstrap-admin command run from this same,
# immutable release image before the frontend container is promoted.
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts/migrate-db.mjs ./scripts/migrate-db.mjs
COPY --from=builder /app/scripts/create-admin-user.mjs ./scripts/create-admin-user.mjs
EXPOSE 3000
CMD ["node", "server.js"]
