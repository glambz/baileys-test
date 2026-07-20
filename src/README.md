# src/ — Backend module overview

This file documents the layout of `src/` for cycle
`be-ai-auto-reply-2026-07-03`. See `docs/be/MVP.md` for the goals doc.

## Folder tree

```
src/
  index.js                          # Express bootstrap + AI routes + messages.upsert hook
  config/                           # env loader (existing)
  whatsapp/                         # Baileys socket (existing) — minor: AI trigger wired in index.js
  inbox/                            # per-contact .md writer (existing)
  controllers/
    auth/                           # (existing)
    broadcast/                      # (existing)
    messages/                       # (existing)
    ai/
      ask.js                        # POST /api/crm/ai/ask handler
      replyPreview.js               # POST /api/crm/ai/reply-preview handler
      toggleMode.js                 # POST /api/crm/ai/toggle-mode handler
      schemas.js                    # RagAnswerSchema (zod)
  routes/                           # existing (auth / messages / broadcast / contacts)
  ai/
    index.js                        # re-exports the AI_NAMESPACE
    settings/
      defaults.js                   # DEFAULT_AI_SETTINGS (frozen)
      schema.js                     # zod AiSettingsSchema + SettingsValidationError
      store.js                      # Postgres-backed getSettings / updateSettings / resetSettings
      composer.js                   # buildSystemPrompt (byte-equal to FE)
      hardened-rules.js             # byte-stable 4-rule Indonesian block
    llm/
      base-prompts.js               # BAILEYS_AI_SYSTEM_PROMPT_{ID,EN} (frozen)
      openai-compat.js              # OpenAI-compatible client (default = MiniMax-M3)
      anthropic-compat.js           # Anthropic-compatible fallback
      prompt.js                     # buildUserPrompt (CONTEXT + HISTORY + QUESTION)
      parse.js                      # parseStructuredOutput + zod schemas
      embed.js                      # MiniMax embeddings client with LRU cache
      index.js                      # namespace + getLlmClient()
    retrieval/
      bm25.js                       # Postgres FTS
      ann.js                        # pgvector cosine ANN
      reranker.js                   # MiniMax-embedding cosine rerank
      hybrid.js                     # BM25 + ANN (RRF) + rerank + turbo cutoff + contact-scope filter
      chunker.js                    # semantic chunking with overlap
      ocr.js                        # PDF / DOCX / HTML / XLSX / CSV / TXT
    store/
      chunks.js                     # READ-ONLY public API; __ingestUpsertChunk is module-internal
      ingest.js                     # file → OCR → chunk → embed → upsert
      ingest-worker.js              # async queue (drains serially)
      entities.js                   # (placeholder; CRUD via routes/crm.js)
    whatsapp/
      handoff.js                    # AIReplyMode state machine + ForbiddenTransitionError
      send.js                       # sock.sendMessage wrapper with retry + audit
      trigger.js                    # processInboundMessage (the 13-step pipeline)
    routes/
      _middleware.js                # requireTenant (single-tenant for MVP)
      ai.js                         # /api/crm/ai/* (3 endpoints)
      crm.js                        # /api/crm/{entities,records}/* (8 endpoints)
      knowledge.js                  # /api/crm/knowledge/* (4 endpoints)
      index.js                      # mountAiRoutes(app)
    audit/
      log.js                        # NDJSON writer
      redact.js                     # redaction helper
  db/
    client.js                       # pg pool + Kysely singleton
    migrate.js                      # idempotent migration runner
    seed.js                         # dev seed
    migrations/
      001-initial.sql               # extends chats (ai_mode CHECK + ai_pending_flag)
      002-ai-tables.sql             # ai_settings + knowledge_* + entity_*
      003-indexes.sql               # ivfflat / FTS / GIN / hash / partial
  test/
    composer-byte-identity.test.js  # the single most important invariant
    hardened-rules.test.js
    settings-defaults.test.js
    parse.test.js
    state-machine.test.js
    chunker.test.js
    llm-retry.test.js
    audit.test.js
    hybrid.test.js
    contact-scope.test.js
    ingest.test.js
    routes-ai.test.js
    ai-settings-roundtrip.test.js
    db-migrations.test.js
  scripts/
    ingest-smoke.js                 # RUN_SMOKE=1 node src/scripts/ingest-smoke.js
    audit-tail.js                   # node src/scripts/audit-tail.js [--filter=…] [--since=…]
    mock-inbound.js                 # node src/scripts/mock-inbound.js <chatId> <body>
  i18n/
    ai-fallback.js                  # locked Indonesian fallback phrase (byte-equal to FE)
```

## How to add a new endpoint

1. Add a route file under `src/ai/routes/` or extend an existing one.
2. Add a handler under `src/controllers/ai/` (or a sibling controller folder).
3. Validate the body with a zod schema (use `safeParse`, return HTTP 400 with `details: zodError.issues` on failure).
4. Map thrown errors to HTTP status codes per the contract in `docs/be/api/api-spec.md`.
5. Emit an `endpoint_hit` audit row in a `try/finally` block.
6. Add a vitest spec in `src/test/routes-ai.test.js`.

## How to add a new audit event type

1. Extend the locked vocabulary in `src/ai/audit/log.js` (event name + required payload fields).
2. Update `docs/be/features/ai-state-machine/spec.md` and `docs/be/MVP.md` if the new event changes behavior.
3. Add a vitest spec in `src/test/audit.test.js` asserting the JSON object contains all required fields.
4. Update the `CHANGELOG.md` Security section.