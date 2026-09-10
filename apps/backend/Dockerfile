# Baileys backend (Express + Baileys WhatsApp socket).
#
# node:20-slim rather than alpine: baileys pulls in optional native deps and
# glibc avoids musl surprises for the cost of a slightly larger image.
FROM node:20-slim

# curl is used by the compose healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable

# Dependency layer first so a source edit does not reinstall node_modules.
# apps/backend carries its own lockfile, so the image builds standalone
# without the workspace root.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

COPY . .

# The WhatsApp session (auth_info) and the runtime dirs are bind/volume
# mounted by compose — losing auth_info means re-scanning the QR code.
RUN mkdir -p auth_info runtime/inbox_logs runtime/logs data/kb data/audit

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

EXPOSE 3000

# No dotenv-cli here: compose supplies the environment (env_file + overrides),
# so reading .env a second time inside the container would shadow the
# container-specific DATABASE_URL / EMBEDDING_BASE_URL values.
CMD ["node", "src/index.js"]
