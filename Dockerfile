# syntax=docker/dockerfile:1

# Pin linux/amd64 so native deps (e.g. tree-sitter) match Railway runners when building on Apple Silicon.
FROM --platform=linux/amd64 node:22-bookworm-slim AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates build-essential python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Root install (@repo-metrics/engine file: link)
COPY package.json package-lock.json ./
COPY packages/engine ./packages/engine
RUN npm ci

# Dashboard deps (separate lockfile; avoids duplicate engine build in a later step)
COPY apps/dashboard/package.json apps/dashboard/package-lock.json ./apps/dashboard/
RUN npm ci --prefix apps/dashboard

# App sources
COPY apps/dashboard ./apps/dashboard

# One engine compile, then Next (do not use `npm run build` in dashboard — it runs build:engine again)
RUN npm run build --prefix packages/engine

# NEXT_PUBLIC_* must exist at *build* time so Next inlines them into browser bundles.
# Railway: declare these as ARGs and set the matching service variables before deploy.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN cd apps/dashboard && npx next build

# --- Runtime: git required for analyzeFromGitHubUrl clone path ---
FROM --platform=linux/amd64 node:22-bookworm-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Standalone trace output (monorepo layout → server at apps/dashboard/server.js)
COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder /app/apps/dashboard/public ./apps/dashboard/public

USER node

EXPOSE 3000

CMD ["node", "apps/dashboard/server.js"]
