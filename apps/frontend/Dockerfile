# Frontend (Vite dev server).
#
# Deliberately the dev server, not a static nginx build: this is an internal
# operator dashboard that is actively developed, and HMR against the live
# backend is more useful here than an optimised bundle. Swap the CMD for
# `pnpm build` + a static server when this is deployed for real.
FROM node:20-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ENV VITE_USE_REAL_API=true

EXPOSE 5176

# --host binds 0.0.0.0 so the port is reachable from outside the container.
CMD ["pnpm", "exec", "vite", "--host", "0.0.0.0", "--port", "5176"]
