# Running Baileys Studio with Docker

```bash
docker compose up -d --build
```

| Service | Host port | Purpose |
|---|---|---|
| `postgres` | 55432 | pgvector/pg16 — chats, messages, KB chunks, record embeddings |
| `sidecar` | 8765 | sentence-transformers embedding API (bge-m3, 1024-dim) |
| `backend` | 3000 | Express + Baileys WhatsApp socket, AI pipeline |
| `frontend` | 5176 | Vite dev server (operator dashboard) |

Open <http://localhost:5176>. Secrets are read from `apps/backend/.env`, which is
gitignored — copy `.env.example` and fill in `OPENAI_API_KEY` (MiniMax) before
the first run.

## Letting other projects send WhatsApp messages

This is what the `whatsapp` network is for. This stack owns and creates it with
a fixed, unprefixed name, so other compose projects attach to it as external.

In the other project's `docker-compose.yml`:

```yaml
networks:
  whatsapp:
    external: true

services:
  your-app:
    networks: [default, whatsapp]
```

Then call the API by hostname — no host ports, no IP addresses:

```bash
curl -X POST http://whatsapp-api:3000/api/messages/send \
  -H 'Content-Type: application/json' \
  -d '{"phone":"628123456789","message":"hello from another project"}'
```

`whatsapp-api` is a network alias on the `backend` service. Prefer it over the
bare service name `backend`, which means nothing from another project's point
of view.

Bring this stack up **first** — an external network must already exist before a
dependent project can start. If the other project reports
`network whatsapp declared as external, but could not be found`, that is all
this is.

To attach an already-running container instead of editing its compose file:

```bash
docker network connect whatsapp <container-name>
```

## First run: migrating from the standalone `baileys-pg` container

Before Docker, Postgres ran as a hand-started container named `baileys-pg`,
also on port 55432 with its data in an anonymous volume. The compose `postgres`
service uses its own named volume, so **it starts empty** and the port collides.

Migrate once:

```bash
# 1. Dump the old container while it is still running
docker exec baileys-pg pg_dump -U baileys -d baileys --clean --if-exists > baileys-predocker.sql

# 2. Free port 55432 (reversible — the old container and its volume are kept)
docker stop baileys-pg

# 3. Start only Postgres and wait for it to report healthy
docker compose up -d postgres

# 4. Restore
docker exec -i baileys-postgres psql -U baileys -d baileys < baileys-predocker.sql

# 5. Bring up the rest
docker compose up -d
```

Nothing above deletes the old container or its volume. To roll back:
`docker compose down && docker start baileys-pg`.

Starting from scratch instead? Skip the dump and run the migrations:

```bash
docker compose exec backend node src/db/migrate.js
docker compose exec backend node src/db/seed.js   # optional sample data
```

## The WhatsApp session

`auth_info/` holds the paired session and lives in the `wa_auth` volume. It must
persist — `docker compose down -v` deletes it and the next start needs a fresh
QR scan from <http://localhost:5176/qr>.

Use `docker compose down` (no `-v`) for routine stops.

## The embedding model

The sidecar needs `MarcoAland/Indonesian-bge-m3` (~2.2 GB). By default it is
downloaded into the `hf_cache` volume on first start, so the first
`docker compose up` is slow and needs network access.

To reuse a cache you already have on the host, set an **absolute** path in a
`.env` file at the repo root:

```
HF_CACHE_DIR=C:/Users/you/.cache/huggingface
```

Compose does not expand `~`, so a tilde would create a directory literally
named `~` and the model would be re-downloaded.

The sidecar's healthcheck has a 90s `start_period` because the model takes
~25–55s to load. `backend` waits for that healthcheck, so a slow first start is
expected rather than broken.

## Troubleshooting

**`backend` restarts / `getPool is not a function` in tests** — the sidecar is
not reachable. `docker compose logs sidecar`; on a cold cache it may still be
downloading the model.

**Dimension mismatch errors** — `EMBEDDING_DIM` must be `1024` to match the
schema (migration 004 moved every vector column to `VECTOR(1024)`). Compose
pins it; only an override in `apps/backend/.env` could break it.

**Port already in use on 55432** — the standalone `baileys-pg` container is
still running. See the migration section above.

**`Another instance of this server is already running (pid 1)`** — fixed. The
single-instance lock compared only the pid, and in a container the app is
always pid 1, so the lock left by the previous container always looked live
and every restart refused to boot. The lock now also compares the recorded
hostname (the container id) and treats a lock naming our own pid as stale.
If you are on an image built before that fix, clear it once with:

```bash
docker run --rm -v baileystest_wa_auth:/lock alpine rm -f /lock/server.lock
```

**Running the test suite while the stack is up** — both Postgres (55432) and
the sidecar (8765) publish to the host precisely so `pnpm test` works against
the containerised services. Nothing extra to start.

**Backend logs `Timed Out` from Baileys on startup** — normal transient noise
while the WhatsApp socket runs its init queries; check
`GET /api/auth/status` for the real state.
