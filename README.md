# Baileys Studio

WhatsApp customer support with an AI auto-reply pipeline, human takeover, and a
CRM knowledge base. Built on
[`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys),
MiniMax-M3, and Postgres + pgvector.

## What it does

- **Auto-reply engine** — an inbound WhatsApp message is answered from the
  knowledge base and CRM records via hybrid retrieval (BM25 + pgvector ANN,
  fused with RRF), with the model scoring its own confidence. Above the
  threshold it replies; below it, it stays quiet and hands the chat to a human.
- **Human takeover** — an escalated chat carries a briefing generated at the
  moment of escalation: what the customer wants, what the AI tried, what
  blocked it, and the suggested next action. Agents reply manually without
  fighting the pipeline.
- **Internal AI assistant** — a chat UI for staff, answering over the same
  knowledge base with source citations.
- **CRM** — CRUD over custom entities whose records are re-indexed into the
  vector store on every write, so the assistant can answer from them.

Guardrails worth knowing about: replies are held if retrieval scores too low,
if the model's confidence is under the threshold, or if the answer contains a
number that appears nowhere in the knowledge base.

## Layout

```
apps/backend    Express API, Baileys socket, AI pipeline, migrations
apps/frontend   React + Vite operator dashboard
docs/           Docker guide and design specs
```

A pnpm workspace. `pnpm dev` runs both apps; `pnpm test` runs both suites.

## Running it

Docker is the shortest path — see **[docs/docker.md](docs/docker.md)** for the
full guide, including how other projects can send WhatsApp messages through
this stack over the shared `whatsapp` network.

```bash
cp apps/backend/.env.example apps/backend/.env   # add your MiniMax API key
docker compose up -d --build
```

Then open <http://localhost:5176> and pair the WhatsApp session at `/qr`.

Running on the host instead needs Postgres with pgvector, the Python embedding
sidecar (`apps/backend/src/scripts/embed_sidecar.py`), and the backend and
frontend dev servers. The Docker guide covers the ports and environment they
expect.

## Tests

```bash
pnpm test
```

The backend suite needs Postgres and the embedding sidecar reachable. Both are
published to the host by the compose stack, so `docker compose up -d` is enough
to satisfy them.
