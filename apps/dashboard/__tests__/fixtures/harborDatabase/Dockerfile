FROM node:24-bookworm@sha256:8fa96264f302f58bbb13aa7339c541547b56975766ce956c875da149452a3e40
ENV CI=true
ENV DATABASE_URL=postgres://bookworm:bookworm@postgres:5432/bookworm_test
WORKDIR /app
COPY repo.bundle /tmp/repo.bundle
RUN git clone -q -b hecate-snapshot /tmp/repo.bundle /app && rm /tmp/repo.bundle && git -C /app checkout -q 4122f9a921e8471c7d4fd06551e1dadf79694787 && git -C /app branch -D hecate-snapshot
RUN cd /app && rm -rf .git && git init -q && git -c user.name=hecate -c user.email=hecate@localhost add -A && git -c user.name=hecate -c user.email=hecate@localhost commit -qm base
RUN cd /app && corepack enable && pnpm install --frozen-lockfile
RUN cd /app/server && corepack enable && pnpm install --frozen-lockfile
