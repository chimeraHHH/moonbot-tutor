# ---- build stage ----
# node:22-alpine is used because it is already cached on the deploy server
# (avoids a slow base-image pull from a foreign registry). NestJS has no native
# deps, so alpine works without extra system packages.
FROM node:22-alpine AS builder
WORKDIR /app
# Use the China npm mirror for fast installs on the deploy server.
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm config set registry "$NPM_REGISTRY"
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- production stage ----
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
